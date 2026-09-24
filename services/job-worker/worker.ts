// One worker run: queue any DLQ sweeps that are due, then claim and run jobs one at a time until
// the queue is empty or the time budget is spent. A scheduler calls this repeatedly. Nothing here
// assumes it is the only worker, because claiming is exclusive and every job holds a lease.
//
// Timing, so a live job is never reaped (and run twice) while it is still running:
//   * one job per claim, so a lease only has to cover ONE job, not a batch waiting its turn;
//   * the deadline is checked before every claim, so a run ends by budget + one job timeout;
//   * the lease is jobTimeout + a margin, and the handler is aborted when its timeout fires.
// With the defaults a run ends within 40s + 25s = 65s, well inside the edge wall-clock limit.
import { logger } from "../shared/log.ts";
import { dispatch } from "./dispatch.ts";
import { type Handler, type HandlerContext, handlers as defaultHandlers } from "./handlers.ts";
import type { RoutingConfig } from "./routing.ts";
import type { ClaimedJob, WorkerStore } from "./store.ts";

export interface RunOptions {
  /** Stop claiming new work after this long. Budget + jobTimeoutMs must fit the host's limit. */
  budgetMs?: number;
  jobTimeoutMs?: number;
  handlers?: Record<string, Handler>;
  /** Where lead routing sends and how. Without a Resend key, email jobs fail as not configured. */
  routing?: Partial<RoutingConfig>;
  log?: HandlerContext["log"];
  now?: () => number;
}

export interface RunSummary {
  sweepsQueued: number;
  claimed: number;
  succeeded: number;
  failed: number;
}

const DEFAULTS = { budgetMs: 40_000, jobTimeoutMs: 25_000 };
/** Headroom between a job's timeout and its lease expiring, for the completion round trip. */
const LEASE_MARGIN_SECONDS = 60;

export async function runOnce(store: WorkerStore, options: RunOptions = {}): Promise<RunSummary> {
  const { budgetMs, jobTimeoutMs } = { ...DEFAULTS, ...options };
  const leaseSeconds = Math.ceil(jobTimeoutMs / 1000) + LEASE_MARGIN_SECONDS;
  const registry = options.handlers ?? defaultHandlers;
  const log = options.log ?? logger("job-worker");
  const now = options.now ?? Date.now;
  const deadline = now() + budgetMs;
  const routing: RoutingConfig = {
    fetch: globalThis.fetch,
    now: Date.now,
    timeoutMs: 10_000,
    ...options.routing,
  };

  const summary: RunSummary = {
    sweepsQueued: await store.enqueueDlqSweeps(),
    claimed: 0,
    succeeded: 0,
    failed: 0,
  };

  while (now() < deadline) {
    const [job] = await store.claimJobs(1, leaseSeconds);
    if (!job) break;
    summary.claimed += 1;
    const ok = await runJob(
      job,
      store,
      registry,
      { store, log, routing, jobId: job.id },
      jobTimeoutMs,
    );
    if (ok) summary.succeeded += 1;
    else summary.failed += 1;
  }

  log("info", "worker_run_finished", { ...summary });
  return summary;
}

async function runJob(
  job: ClaimedJob,
  store: WorkerStore,
  registry: Record<string, Handler>,
  ctx: Omit<HandlerContext, "signal">,
  timeoutMs: number,
): Promise<boolean> {
  const decision = dispatch(job);
  const handler = decision.action === "run" ? registry[decision.kind] : undefined;
  const failure =
    decision.action === "fail"
      ? decision.reason
      : handler
        ? await attempt((signal) => handler(decision.payload, { ...ctx, signal }), timeoutMs)
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

/**
 * Run with a timeout. Resolves to null on success, or to the failure message. On timeout the
 * handler's signal is aborted, so its in-flight calls stop rather than carrying on unobserved.
 */
async function attempt(
  run: (signal: AbortSignal) => Promise<void>,
  timeoutMs: number,
): Promise<string | null> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<string>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve(`timed out after ${timeoutMs}ms`);
    }, timeoutMs);
  });
  try {
    return await Promise.race([run(controller.signal).then(() => null), timeout]);
  } catch (error) {
    return messageOf(error);
  } finally {
    clearTimeout(timer);
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
