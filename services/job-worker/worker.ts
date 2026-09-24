// One worker run: queue any DLQ sweeps that are due, then claim and run jobs until the queue is
// empty or the time budget is spent. A scheduler calls this repeatedly. Nothing here assumes it is
// the only worker, because claiming is exclusive and every job holds a lease.
import { dispatch } from "./dispatch.ts";
import { type Handler, type HandlerContext, handlers as defaultHandlers } from "./handlers.ts";
import type { ClaimedJob, WorkerStore } from "./store.ts";

export interface RunOptions {
  /** Stop claiming new work after this long. Keep it well inside the host's wall-clock limit. */
  budgetMs?: number;
  batchSize?: number;
  /** Must exceed jobTimeoutMs, or a slow but live job would be reaped while it is still running. */
  leaseSeconds?: number;
  jobTimeoutMs?: number;
  handlers?: Record<string, Handler>;
  log?: HandlerContext["log"];
  now?: () => number;
}

export interface RunSummary {
  sweepsQueued: number;
  claimed: number;
  succeeded: number;
  failed: number;
}

const DEFAULTS = { budgetMs: 50_000, batchSize: 10, leaseSeconds: 120, jobTimeoutMs: 30_000 };

export async function runOnce(store: WorkerStore, options: RunOptions = {}): Promise<RunSummary> {
  const { budgetMs, batchSize, leaseSeconds, jobTimeoutMs } = { ...DEFAULTS, ...options };
  const registry = options.handlers ?? defaultHandlers;
  const log = options.log ?? jsonLog;
  const now = options.now ?? Date.now;
  const deadline = now() + budgetMs;

  const summary: RunSummary = {
    sweepsQueued: await store.enqueueDlqSweeps(),
    claimed: 0,
    succeeded: 0,
    failed: 0,
  };

  while (now() < deadline) {
    const jobs = await store.claimJobs(batchSize, leaseSeconds);
    if (jobs.length === 0) break;
    summary.claimed += jobs.length;

    for (const job of jobs) {
      const ok = await runJob(job, store, registry, { store, log }, jobTimeoutMs);
      if (ok) summary.succeeded += 1;
      else summary.failed += 1;
    }
  }

  log("info", "worker_run_finished", { ...summary });
  return summary;
}

async function runJob(
  job: ClaimedJob,
  store: WorkerStore,
  registry: Record<string, Handler>,
  ctx: HandlerContext,
  timeoutMs: number,
): Promise<boolean> {
  const decision = dispatch(job);
  const handler = decision.action === "run" ? registry[decision.kind] : undefined;
  const failure =
    decision.action === "fail"
      ? decision.reason
      : handler
        ? await attempt(() => handler(decision.payload, ctx), timeoutMs)
        : `no handler registered for ${job.kind}`;

  ctx.log(failure ? "warn" : "info", failure ? "job_failed" : "job_done", {
    job_id: job.id,
    kind: job.kind,
    attempt: job.attempts,
    ...(failure ? { reason: failure } : {}),
  });

  try {
    await store.completeJob(job, failure === null, failure ?? undefined);
  } catch (error) {
    // Most likely the lease expired and another worker took the job. It owns the outcome now, and
    // the handler was idempotent, so there is nothing to undo.
    ctx.log("warn", "job_complete_refused", { job_id: job.id, reason: messageOf(error) });
    return false;
  }
  return failure === null;
}

/** Run with a timeout. Resolves to null on success, or to the failure message. */
async function attempt(run: () => Promise<void>, timeoutMs: number): Promise<string | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<string>((resolve) => {
    timer = setTimeout(() => resolve(`timed out after ${timeoutMs}ms`), timeoutMs);
  });
  try {
    return await Promise.race([run().then(() => null), timeout]);
  } catch (error) {
    return messageOf(error);
  } finally {
    clearTimeout(timer);
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Structured JSON, one line per event. Callers never pass PII: ids, kinds and counts only. */
function jsonLog(
  level: "info" | "warn" | "error",
  event: string,
  fields: Record<string, unknown> = {},
): void {
  const line = JSON.stringify({ level, event, service: "job-worker", ...fields });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  // eslint-disable-next-line no-console -- info lines are the structured log stream (stdout)
  else console.log(line);
}
