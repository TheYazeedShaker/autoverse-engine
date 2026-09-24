// One handler per job kind. Each is idempotent: a job whose worker died runs again, and running a
// handler twice must leave the same result as running it once.
import { decideLead } from "../capture-lead/lead.ts";
import { MAX_ATTEMPTS, planReplay } from "../ingest-event/ingest.ts";
import type { JobKind } from "./dispatch.ts";
import { type RoutingConfig, deliverLeadWebhook, sendLeadEmail } from "./routing.ts";
import type { DeadLetter, DeadLetterQueue, WorkerStore } from "./store.ts";

export interface HandlerContext {
  store: WorkerStore;
  log: (level: "info" | "warn" | "error", event: string, fields?: Record<string, unknown>) => void;
  routing: RoutingConfig;
  /** The job being run. Routing uses it as the idempotency key downstream. */
  jobId: string;
  /** Aborted when the job's timeout fires. Stop work and outbound calls promptly. */
  signal: AbortSignal;
}

export type Handler = (payload: Record<string, unknown>, ctx: HandlerContext) => Promise<void>;

/** How many dead letters one sweep replays. The next tick queues another sweep if more remain. */
export const SWEEP_BATCH = 50;

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
  { store, log, signal }: HandlerContext,
): Promise<void> {
  const rows = await store.pendingDeadLetters(queue, SWEEP_BATCH);
  let resolved = 0;
  let gaveUp = 0;
  let retrying = 0;

  for (const row of rows) {
    // Timed out: stop between rows. Anything not reached stays pending for the next sweep.
    if (signal.aborted) break;
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
  // Rows that used up their attempts never reach here: pendingDeadLetters filters them out.
  const decision = decideLead(row.source_payload);
  return decision.outcome === "accept"
    ? { action: "replay", run: (store) => store.captureLead(decision.lead) }
    : { action: "give-up", reason: decision.error_message };
}

/** Route one lead through `send`, or complete as a no-op if the lead or the channel is absent. */
function routeLead(channel: "email" | "webhook", send: typeof sendLeadEmail): Handler {
  return async (payload, { store, log, routing, jobId, signal }) => {
    const leadId = String(payload.lead_id);
    const target = await store.leadRouting(leadId);
    if (!target) {
      // Leads are never deleted by the pipeline, so this is someone's data fix. Nothing to send.
      log("warn", `lead_${channel}_no_lead`, { lead_id: leadId });
      return;
    }
    const sent = await send(target, jobId, { ...routing, signal });
    log("info", sent ? `lead_${channel}_sent` : `lead_${channel}_not_configured_for_market`, {
      lead_id: leadId,
      brand_id: target.lead.brand_id,
      market: target.lead.market_code,
    });
  };
}

/** Counts that should be zero, or close to it. Anything off is logged at error level (alerting). */
// jobs_failed_24h: a routing job that spent all its attempts is a brand that never heard about a
// lead. Leads are stricter than events, and any failure pages.
const RECONCILIATION_ALARMS = [
  "jobs_failed_24h",
  "lead_dlq_open",
  "lead_dlq_gave_up",
  "event_dlq_gave_up",
  "jobs_overdue",
];

export const handlers: Record<JobKind, Handler> = {
  "retry-event-dlq": (_payload, ctx) => sweep("event", planEventReplay, ctx),
  "retry-lead-dlq": (_payload, ctx) => sweep("lead", planLeadReplay, ctx),
  "notify-lead-email": routeLead("email", sendLeadEmail),
  "deliver-lead-webhook": routeLead("webhook", deliverLeadWebhook),
  "daily-reconciliation": async (_payload, { store, log }) => {
    const report = await store.reconciliationReport();
    const gaps = RECONCILIATION_ALARMS.filter((key) => (report[key] ?? 0) > 0);
    log(gaps.length > 0 ? "error" : "info", "daily_reconciliation", { ...report, gaps });
  },
};
