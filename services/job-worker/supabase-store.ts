// The real WorkerStore, over supabase-js with the service role. The service role belongs here: the
// worker is a server-side job, never reachable by an anonymous caller (production plan §3.1).
import type { SupabaseClient } from "@supabase/supabase-js";
import { EVENTS_UPSERT_OPTIONS } from "../ingest-event/ingest.ts";
import type { ClaimedJob, DeadLetter, DeadLetterQueue, LeadRouting, WorkerStore } from "./store.ts";

const DLQ_TABLE = { event: "event_dlq", lead: "lead_dlq" } as const;

/** Throw on a PostgREST error, naming the operation but never echoing row data. */
function check<T>(
  operation: string,
  result: { data: T; error: { code?: string; message: string } | null },
): T {
  if (result.error) {
    throw new Error(`${operation} failed: ${result.error.code ?? result.error.message}`);
  }
  return result.data;
}

export function supabaseStore(client: SupabaseClient): WorkerStore {
  return {
    async enqueueDlqSweeps() {
      return check("enqueue_dlq_sweeps", await client.rpc("enqueue_dlq_sweeps")) as number;
    },

    async claimJobs(batchSize, leaseSeconds) {
      const rows = check(
        "claim_jobs",
        await client.rpc("claim_jobs", { batch_size: batchSize, lease_seconds: leaseSeconds }),
      );
      return (rows ?? []) as ClaimedJob[];
    },

    async completeJob(job, succeeded, error) {
      check(
        "complete_job",
        await client.rpc("complete_job", {
          job_id: job.id,
          token: job.lease_token,
          succeeded,
          error_text: error ?? null,
        }),
      );
    },

    async pendingDeadLetters(queue: DeadLetterQueue, limit: number) {
      const rows = check(
        `read ${DLQ_TABLE[queue]}`,
        await client
          .from(DLQ_TABLE[queue])
          .select("id, source_payload, attempts")
          .is("resolved_at", null)
          .lt("attempts", 5)
          .order("created_at")
          .limit(limit),
      );
      return (rows ?? []) as DeadLetter[];
    },

    async resolveDeadLetter(queue, id) {
      check(
        `resolve ${DLQ_TABLE[queue]}`,
        await client
          .from(DLQ_TABLE[queue])
          .update({
            resolved_at: new Date().toISOString(),
            last_attempted_at: new Date().toISOString(),
          })
          .eq("id", id),
      );
    },

    async recordDeadLetterFailure(queue, id, attempts, error) {
      check(
        `record ${DLQ_TABLE[queue]} failure`,
        await client
          .from(DLQ_TABLE[queue])
          .update({
            attempts,
            last_error: error,
            last_attempted_at: new Date().toISOString(),
          })
          .eq("id", id),
      );
    },

    async storeEvent(event) {
      // ON CONFLICT (id) DO NOTHING: the same options ingest-event uses (see its upsert.test.ts).
      check("store event", await client.from("events").upsert(event, EVENTS_UPSERT_OPTIONS));
    },

    async captureLead(lead) {
      return check("capture_lead", await client.rpc("capture_lead", { payload: lead })) as string;
    },

    async leadRouting(leadId) {
      const routing = check(
        "lead_routing",
        await client.rpc("lead_routing", { p_lead_id: leadId }),
      );
      return (routing ?? null) as LeadRouting | null;
    },

    async reconciliationReport() {
      return check("reconciliation_report", await client.rpc("reconciliation_report")) as Record<
        string,
        number
      >;
    },
  };
}
