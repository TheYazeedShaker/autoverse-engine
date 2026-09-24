import { z } from "zod";

// Event ingest: schema, and the decision about what to do with a payload. Pure — no database, no
// Deno, no network — so the rules are unit tested directly and the handler stays a thin shell.
//
// Two properties this file exists to protect:
//   * The endpoint never returns 5xx. A consumer surface must not break because our pipeline is
//     unwell, and a retrying client hammering a failing endpoint makes an incident worse. A payload
//     we cannot store goes to the dead-letter queue and the caller gets 202.
//   * The event id is the idempotency key. At-least-once delivery means the same event WILL arrive
//     twice; the second arrival must be absorbed, not duplicated.

/** A validated event, ready to upsert. */
// z.guid() rather than z.uuid(): Zod 4's uuid() enforces RFC version and variant bits, while
// Postgres's uuid type accepts any well-formed hex. Being stricter than the database would
// dead-letter events it would have stored happily.
export const eventSchema = z.object({
  id: z.guid(),
  brand_id: z.guid(),
  kind: z
    .string()
    .regex(
      /^[a-z0-9][a-z0-9_.-]{0,62}$/,
      "kind must be lower-case dotted, e.g. configurator.opened",
    ),
  session_id: z.guid().nullish(),
  market_code: z
    .string()
    .regex(/^[A-Z]{2}$/, "market_code must be a two-letter ISO country code")
    .nullish(),
  model_id: z.guid().nullish(),
  trim_id: z.guid().nullish(),
  payload: z.record(z.string(), z.unknown()).default({}),
});

export type IngestEvent = z.infer<typeof eventSchema>;

/**
 * How accepted events are written. `ignoreDuplicates` makes PostgREST emit
 * `ON CONFLICT (id) DO NOTHING`. Without it the upsert becomes `DO UPDATE`, and the write-once
 * trigger rejects that as soon as the redelivered event has already been processed. The whole
 * batch then dead-letters, on ordinary at-least-once redelivery.
 */
export const EVENTS_UPSERT_OPTIONS = { onConflict: "id", ignoreDuplicates: true } as const;

/** A batch is accepted as a whole or split: each event is judged on its own. */
export const batchSchema = z.union([eventSchema, z.array(eventSchema).min(1).max(100)]);

export interface Accepted {
  outcome: "accept";
  event: IngestEvent;
}

export interface DeadLetter {
  outcome: "dead-letter";
  /** Kept verbatim, so a replay reconstructs exactly what was sent. */
  source_payload: Record<string, unknown>;
  error_message: string;
}

export type Decision = Accepted | DeadLetter;

/** PII must never reach a log line, so a rejection is described by shape, not content. */
export function describeFailure(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .slice(0, 5)
    .join("; ");
}

/**
 * Decide what happens to one raw payload. Anything that does not validate becomes a dead letter
 * rather than an error to the caller: the payload is kept verbatim so it can be replayed once the
 * cause is fixed, which is what "zero loss" means in practice.
 */
export function decide(raw: unknown): Decision {
  const parsed = eventSchema.safeParse(raw);
  if (parsed.success) {
    return { outcome: "accept", event: parsed.data };
  }
  return {
    outcome: "dead-letter",
    source_payload: asObject(raw),
    error_message: describeFailure(parsed.error),
  };
}

export function decideBatch(raw: unknown): Decision[] {
  const items = Array.isArray(raw) ? raw : [raw];
  if (items.length === 0) {
    return [{ outcome: "dead-letter", source_payload: {}, error_message: "(root): empty batch" }];
  }
  if (items.length > 100) {
    return [
      {
        outcome: "dead-letter",
        source_payload: { count: items.length },
        error_message: "(root): batch larger than 100 events",
      },
    ];
  }
  return items.map(decide);
}

function asObject(raw: unknown): Record<string, unknown> {
  return raw !== null && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : { value: String(raw) };
}

// ---------------------------------------------------------------------------------------------
// Retry worker
// ---------------------------------------------------------------------------------------------

export const MAX_ATTEMPTS = 5;

export interface DlqRow {
  id: string;
  source_payload: Record<string, unknown>;
  attempts: number;
}

export type ReplayDecision =
  { action: "replay"; event: IngestEvent } | { action: "give-up"; reason: string };

/**
 * What the retry worker should do with one dead letter. A row that still does not validate is not
 * retried forever: after MAX_ATTEMPTS it is given up on and stays in the queue as an incident to be
 * looked at by a person, rather than spinning silently.
 */
export function planReplay(row: DlqRow): ReplayDecision {
  if (row.attempts >= MAX_ATTEMPTS) {
    return { action: "give-up", reason: `still failing after ${MAX_ATTEMPTS} attempts` };
  }
  const decision = decide(row.source_payload);
  if (decision.outcome === "accept") {
    return { action: "replay", event: decision.event };
  }
  return { action: "give-up", reason: decision.error_message };
}
