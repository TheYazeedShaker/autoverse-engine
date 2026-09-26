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
//
// One exception to "dead-letter, don't refuse": size (ADR 0016). Events are write-once and can't be
// trimmed, so an oversized payload is refused with a 413 and stored nowhere, dead-letter queue
// included.

/** Per event payload, serialized (owner decision on BLOCK #9, ADR 0016). */
export const MAX_PAYLOAD_BYTES = 8192;
/**
 * Per event, whole. A valid event is small apart from its payload (ids, a short kind), so this is
 * the payload plus 1 KB of room. It stops an event that would fail validation for another reason
 * from carrying its bulk into the dead-letter queue in some other field.
 */
export const MAX_EVENT_BYTES = MAX_PAYLOAD_BYTES + 1024;
/** Per request to ingest-event. */
export const MAX_BODY_BYTES = 256 * 1024;

const encoder = new TextEncoder();

/**
 * A payload's size as JSON. Postgres measures its own rendering (`payload::text` puts a space
 * after each `:` and `,`), so near the limit the database's CHECK is stricter and has the final
 * say. Both answers are a refusal, never a dead letter.
 */
export const payloadBytes = (payload: unknown): number =>
  encoder.encode(JSON.stringify(payload ?? {})).length;

export interface Oversized {
  part: "payload" | "event";
  bytes: number;
}

/**
 * The first event in the body (one event or a batch) that is over a limit: its payload over
 * MAX_PAYLOAD_BYTES, or the event as a whole over MAX_EVENT_BYTES. Anything in the batch counts,
 * a bare string included, since an invalid item is dead-lettered verbatim.
 */
export function findOversized(raw: unknown): Oversized | null {
  const items = Array.isArray(raw) ? raw : [raw];
  for (const item of items) {
    if (typeof item === "object" && item !== null && "payload" in item) {
      const bytes = payloadBytes((item as { payload: unknown }).payload);
      if (bytes > MAX_PAYLOAD_BYTES) return { part: "payload", bytes };
    }
    const bytes = payloadBytes(item);
    if (bytes > MAX_EVENT_BYTES) return { part: "event", bytes };
  }
  return null;
}

/**
 * Read a request body up to `max` bytes. Returns null as soon as it's over, without buffering the
 * rest: Content-Length can be missing or wrong, so the stream itself is counted.
 */
export async function readCappedText(
  body: ReadableStream<Uint8Array> | null,
  max: number,
): Promise<string | null> {
  if (!body) return "";
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

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
  // No PII in a payload, ever (ADR 0016): names, phones and emails belong only in leads.
  payload: z
    .record(z.string(), z.unknown())
    .refine((p) => payloadBytes(p) <= MAX_PAYLOAD_BYTES, {
      message: `payload is larger than ${MAX_PAYLOAD_BYTES} bytes`,
    })
    .default({}),
});

export type IngestEvent = z.infer<typeof eventSchema>;

/**
 * What a page may send. The brand and market are resolved by the database from the publishable
 * key, origin and market header (owner decision), so an event from a page carries neither. If it
 * does, they're ignored.
 */
export const publicEventSchema = eventSchema.omit({ brand_id: true, market_code: true });
export type PublicEvent = z.infer<typeof publicEventSchema>;

/**
 * How the job worker writes a replayed dead letter through PostgREST (services/job-worker). Page
 * traffic no longer writes this way: ingest_events_public inserts with the same
 * `ON CONFLICT (id) DO NOTHING` in SQL. `ignoreDuplicates` is what makes PostgREST emit DO NOTHING.
 * Without it the upsert becomes `DO UPDATE`, which the write-once trigger rejects as soon as the
 * event has already been processed.
 */
export const EVENTS_UPSERT_OPTIONS = { onConflict: "id", ignoreDuplicates: true } as const;

export interface Accepted<T = IngestEvent> {
  outcome: "accept";
  event: T;
}

export interface DeadLetter {
  outcome: "dead-letter";
  /** Kept verbatim, so a replay reconstructs exactly what was sent. */
  source_payload: Record<string, unknown>;
  error_message: string;
}

export type Decision<T = IngestEvent> = Accepted<T> | DeadLetter;

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
  return decideWith(eventSchema, raw);
}

function decideWith<T>(schema: z.ZodType<T>, raw: unknown): Decision<T> {
  const parsed = schema.safeParse(raw);
  if (parsed.success) {
    return { outcome: "accept", event: parsed.data };
  }
  return {
    outcome: "dead-letter",
    source_payload: asObject(raw),
    error_message: describeFailure(parsed.error),
  };
}

/** A batch against the internal schema (brand included): tests and dead-letter replay. */
export function decideBatch(raw: unknown): Decision[] {
  return batchWith(raw, decide);
}

/** A batch from a page: each event judged against the public schema. */
export function decidePublicBatch(raw: unknown): Decision<PublicEvent>[] {
  return batchWith(raw, (item) => decideWith(publicEventSchema, item));
}

function batchWith<T>(raw: unknown, judge: (item: unknown) => Decision<T>): Decision<T>[] {
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
  return items.map(judge);
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
