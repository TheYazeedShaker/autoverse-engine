// What the worker needs from the database, as an interface. The worker and its handlers only ever
// talk to this, so they're unit tested against an in-memory fake. supabase-store.ts is the one real
// implementation, and it's the one the edge function and the phase gate both run.
import type { Job } from "./dispatch.ts";

/** A job this worker holds. The token is required to complete it (20260924150000_job_leases.sql). */
export interface ClaimedJob extends Job {
  lease_token: string;
}

export type DeadLetterQueue = "event" | "lead";

export interface DeadLetter {
  id: string;
  source_payload: Record<string, unknown>;
  attempts: number;
}

export interface WorkerStore {
  /** Queue a DLQ sweep for each queue that has something to drain. Returns how many were queued. */
  enqueueDlqSweeps(): Promise<number>;
  claimJobs(batchSize: number, leaseSeconds: number): Promise<ClaimedJob[]>;
  completeJob(job: ClaimedJob, succeeded: boolean, error?: string): Promise<void>;

  /** Unresolved dead letters with attempts left, oldest first. */
  pendingDeadLetters(queue: DeadLetterQueue, limit: number): Promise<DeadLetter[]>;
  resolveDeadLetter(queue: DeadLetterQueue, id: string): Promise<void>;
  /** Record a failed replay. `attempts` is the new total, so a give-up can jump straight to the cap. */
  recordDeadLetterFailure(
    queue: DeadLetterQueue,
    id: string,
    attempts: number,
    error: string,
  ): Promise<void>;

  /** Idempotent on the event id: a replay of an event already stored is a no-op. */
  storeEvent(event: Record<string, unknown>): Promise<void>;
  /** Idempotent on submission_id: a replay of a lead already stored returns the existing id. */
  captureLead(lead: Record<string, unknown>): Promise<string>;

  /** The lead and where to route it (public.lead_routing). Null if the lead doesn't exist. */
  leadRouting(leadId: string): Promise<LeadRouting | null>;
  /** Counts for the daily reconciliation (public.reconciliation_report). No payloads, no PII. */
  reconciliationReport(): Promise<Record<string, number>>;
}

export interface LeadRouting {
  /** The lead as captured. PII: it goes to the brand's own inbox or endpoint, and never to a log. */
  lead: Record<string, unknown> & { id: string; brand_id: string; market_code: string };
  emails: string[];
  webhook_url: string | null;
  /** Decrypted from Vault by the database (ADR 0012). Never logged. */
  webhook_secret: string | null;
}
