// One handler per job kind. Each is idempotent: a job whose worker died runs again, and running a
// handler twice must leave the same result as running it once.
import { decideLead } from "../capture-lead/lead.ts";
import { MAX_ATTEMPTS, planReplay } from "../ingest-event/ingest.ts";
import type { JobKind } from "./dispatch.ts";
import type { DeadLetter, DeadLetterQueue, WorkerStore } from "./store.ts";

export interface HandlerContext {
  store: WorkerStore;
  log: (level: "info" | "warn" | "error", event: string, fields?: Record<string, unknown>) => void;
}

export type Handler = (payload: Record<string, unknown>, ctx: HandlerContext) => Promise<void>;

/** How many dead letters one sweep replays. The next tick queues another sweep if more remain. */
export const SWEEP_BATCH = 50;

/**
 * Raised by a handler whose downstream isn't set up yet (no email provider, no webhook signing).
 * The job fails with this message, so staff see it in the queue rather than it vanishing.
 */
export class NotConfiguredError extends Error {
  constructor(kind: JobKind, what: string) {
    super(`${kind} is not configured: ${what}`);
    this.name = "NotConfiguredError";
  }
}

type Replay =
  | { action: "replay"; run: (store: WorkerStore) => Promise<unknown> }
  | { action: "give-up"; reason: string };

/**
 * Drain one dead-letter queue. A row that replays is resolved. A row whose payload can never be
 * stored (it fails validation) is capped at MAX_ATTEMPTS at once, since retrying won't change the
 * answer, and is left for a person. A row that failed for a transient reason counts one attempt
 * and comes back next sweep.
 */
async function sweep(
  queue: DeadLetterQueue,
  plan: (row: DeadLetter) => Replay,
  { store, log }: HandlerContext,
): Promise<void> {
  const rows = await store.pendingDeadLetters(queue, SWEEP_BATCH);
  let resolved = 0;
  let gaveUp = 0;
  let retrying = 0;

  for (const row of rows) {
    const decision = plan(row);
    if (decision.action === "give-up") {
      await store.recordDeadLetterFailure(queue, row.id, MAX_ATTEMPTS, decision.reason);
      gaveUp += 1;
      // A lead we cannot store is a person who will not be called back: that pages (§6.2).
      log(queue === "lead" ? "error" : "warn", `${queue}_dlq_gave_up`, {
        dlq_id: row.id,
        reason: decision.reason,
      });
      continue;
    }
    try {
      await decision.run(store);
      await store.resolveDeadLetter(queue, row.id);
      resolved += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await store.recordDeadLetterFailure(queue, row.id, row.attempts + 1, message);
      retrying += 1;
      log("warn", `${queue}_dlq_replay_failed`, { dlq_id: row.id, attempts: row.attempts + 1 });
    }
  }

  log("info", `${queue}_dlq_swept`, { seen: rows.length, resolved, gave_up: gaveUp, retrying });
}

function planEventReplay(row: DeadLetter): Replay {
  const plan = planReplay(row);
  return plan.action === "replay"
    ? { action: "replay", run: (store) => store.storeEvent(plan.event) }
    : plan;
}

function planLeadReplay(row: DeadLetter): Replay {
  if (row.attempts >= MAX_ATTEMPTS) {
    return { action: "give-up", reason: `still failing after ${MAX_ATTEMPTS} attempts` };
  }
  const decision = decideLead(row.source_payload);
  return decision.outcome === "accept"
    ? { action: "replay", run: (store) => store.captureLead(decision.lead) }
    : { action: "give-up", reason: decision.error_message };
}

export const handlers: Record<JobKind, Handler> = {
  "retry-event-dlq": (_payload, ctx) => sweep("event", planEventReplay, ctx),
  "retry-lead-dlq": (_payload, ctx) => sweep("lead", planLeadReplay, ctx),
  // Both routing kinds wait on open decisions in #build-decisions (email provider; webhook signing).
  // They fail loudly until then. The lead itself is safe in the database and visible to the brand.
  "notify-lead-email": async () => {
    throw new NotConfiguredError("notify-lead-email", "no email provider has been chosen");
  },
  "deliver-lead-webhook": async () => {
    throw new NotConfiguredError(
      "deliver-lead-webhook",
      "no webhook signing scheme has been chosen",
    );
  },
};
