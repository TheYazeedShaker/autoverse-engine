// Job dispatch rules. Pure, so the retry and idempotency behaviour is unit tested without a queue.
//
// Every kind here is idempotent, because a worker that dies mid-job will run it again: the row is
// already marked `running` with its attempt counted, so on the next sweep it comes back. "Ran
// twice" must therefore be indistinguishable from "ran once" for the brand on the receiving end.

export const JOB_KINDS = [
  "notify-lead-email",
  "deliver-lead-webhook",
  "retry-event-dlq",
  "retry-lead-dlq",
] as const;

export type JobKind = (typeof JOB_KINDS)[number];

export interface Job {
  id: string;
  kind: string;
  payload: Record<string, unknown>;
  attempts: number;
  max_attempts: number;
}

export type Dispatch =
  | { action: "run"; kind: JobKind; payload: Record<string, unknown> }
  | { action: "fail"; reason: string };

export function isJobKind(kind: string): kind is JobKind {
  return (JOB_KINDS as readonly string[]).includes(kind);
}

/**
 * Decide what a worker should do with a claimed job. An unknown kind fails immediately rather than
 * retrying: a deploy that removed a handler will not fix itself, and five attempts at nothing just
 * delays someone noticing.
 */
export function dispatch(job: Job): Dispatch {
  if (!isJobKind(job.kind)) {
    return { action: "fail", reason: `unknown job kind: ${job.kind}` };
  }
  if (job.attempts > job.max_attempts) {
    return { action: "fail", reason: `attempt ${job.attempts} exceeds max ${job.max_attempts}` };
  }
  for (const required of requiredFields(job.kind)) {
    if (job.payload[required] === undefined || job.payload[required] === null) {
      return { action: "fail", reason: `payload is missing ${required}` };
    }
  }
  return { action: "run", kind: job.kind, payload: job.payload };
}

function requiredFields(kind: JobKind): string[] {
  switch (kind) {
    case "notify-lead-email":
    case "deliver-lead-webhook":
      return ["lead_id"];
    case "retry-event-dlq":
    case "retry-lead-dlq":
      return [];
  }
}

/**
 * Seconds until the next attempt: 2, 4, 8, 16… matching complete_job in SQL. Both exist because the
 * database is what actually schedules the retry, and the worker needs to be able to explain when.
 */
export function backoffSeconds(attempts: number): number {
  return 2 ** Math.min(Math.max(attempts, 0), 10);
}

/** Whether this failure was the last one the job gets. */
export function isTerminal(job: Job): boolean {
  return job.attempts >= job.max_attempts;
}
