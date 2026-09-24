import { describe, expect, it } from "vitest";
import { SWEEP_BATCH } from "./handlers";
import type { ClaimedJob, DeadLetter, DeadLetterQueue, WorkerStore } from "./store";
import { runOnce } from "./worker";

const BRAND = "22222222-2222-2222-2222-222222222222";

const validEvent = (id: string) => ({ id, brand_id: BRAND, kind: "configurator.opened" });
const validLead = (submission: string) => ({
  brand_id: BRAND,
  market_code: "EG",
  full_name: "Fatma Hassan",
  phone: "+201000000001",
  consent_text_version: "eg-v1",
  consent_at: "2026-09-22T10:00:00.000Z",
  submission_id: submission,
});

interface FakeJob extends ClaimedJob {
  status: "pending" | "running" | "done" | "failed";
  dedupe_key: string | null;
  last_error?: string;
  // complete_job reschedules a failure with a backoff, so it is not claimable again in the same run.
  backingOff?: boolean;
}

interface FakeDlqRow extends DeadLetter {
  resolved: boolean;
  last_error?: string;
}

/** An in-memory store that behaves like the SQL: exclusive claims, leases, dedupe, idempotent writes. */
function fakeStore(seed: { events?: unknown[]; leads?: unknown[]; failEventStore?: boolean } = {}) {
  let seq = 0;
  const jobs: FakeJob[] = [];
  const dlq: Record<DeadLetterQueue, FakeDlqRow[]> = {
    event: (seed.events ?? []).map((p) => ({
      id: `e${++seq}`,
      source_payload: p as Record<string, unknown>,
      attempts: 0,
      resolved: false,
    })),
    lead: (seed.leads ?? []).map((p) => ({
      id: `l${++seq}`,
      source_payload: p as Record<string, unknown>,
      attempts: 0,
      resolved: false,
    })),
  };
  const events = new Map<string, unknown>();
  const leads = new Map<string, string>();
  const pending = (q: DeadLetterQueue) => dlq[q].filter((r) => !r.resolved && r.attempts < 5);

  const store: WorkerStore = {
    async enqueueDlqSweeps() {
      let n = 0;
      for (const [q, kind] of [
        ["event", "retry-event-dlq"],
        ["lead", "retry-lead-dlq"],
      ] as const) {
        const outstanding = jobs.some(
          (j) =>
            j.kind === kind &&
            j.dedupe_key === "sweep" &&
            ["pending", "running"].includes(j.status),
        );
        if (pending(q).length > 0 && !outstanding) {
          jobs.push({
            id: `j${++seq}`,
            kind,
            payload: {},
            attempts: 0,
            max_attempts: 5,
            lease_token: "",
            status: "pending",
            dedupe_key: "sweep",
          });
          n += 1;
        }
      }
      return n;
    },
    async claimJobs(batchSize) {
      const claimed = jobs
        .filter((j) => j.status === "pending" && !j.backingOff)
        .slice(0, batchSize);
      for (const j of claimed) {
        j.status = "running";
        j.attempts += 1;
        j.lease_token = `t${++seq}`;
      }
      return claimed.map((j) => ({ ...j }));
    },
    async completeJob(job, succeeded, error) {
      const row = jobs.find((j) => j.id === job.id);
      if (!row || row.status !== "running" || row.lease_token !== job.lease_token) {
        throw new Error(`job ${job.id} lease lost`);
      }
      row.status = succeeded ? "done" : row.attempts >= row.max_attempts ? "failed" : "pending";
      row.last_error = error;
      row.backingOff = !succeeded;
    },
    async pendingDeadLetters(q, limit) {
      return pending(q)
        .slice(0, limit)
        .map(({ id, source_payload, attempts }) => ({ id, source_payload, attempts }));
    },
    async resolveDeadLetter(q, id) {
      const row = dlq[q].find((r) => r.id === id);
      if (row) row.resolved = true;
    },
    async recordDeadLetterFailure(q, id, attempts, error) {
      const row = dlq[q].find((r) => r.id === id);
      if (row) Object.assign(row, { attempts, last_error: error });
    },
    async storeEvent(event) {
      if (seed.failEventStore) throw new Error("store event failed: 57P01");
      if (!events.has(String(event.id))) events.set(String(event.id), event);
    },
    async captureLead(lead) {
      const key = `${String(lead.brand_id)}:${String(lead.submission_id)}`;
      if (!leads.has(key)) leads.set(key, `lead-${leads.size + 1}`);
      return leads.get(key) ?? "";
    },
  };

  return { store, jobs, dlq, events, leads };
}

const quiet = () => {};

describe("runOnce", () => {
  it("drains both dead-letter queues on its own: sweeps are queued, claimed and run", async () => {
    const f = fakeStore({
      events: [validEvent("11111111-1111-1111-1111-111111111111")],
      leads: [validLead("33333333-3333-3333-3333-333333333333")],
    });

    const summary = await runOnce(f.store, { log: quiet });

    expect(summary.sweepsQueued).toBe(2);
    expect(summary.succeeded).toBe(2);
    expect(f.events.size).toBe(1);
    expect(f.leads.size).toBe(1);
    expect(f.dlq.event.every((r) => r.resolved)).toBe(true);
    expect(f.dlq.lead.every((r) => r.resolved)).toBe(true);
  });

  it("a replay of a dead letter that already landed changes nothing (idempotent)", async () => {
    const lead = validLead("33333333-3333-3333-3333-333333333333");
    const f = fakeStore({
      leads: [lead, lead],
      events: [validEvent("11111111-1111-1111-1111-111111111111")],
    });
    await f.store.storeEvent(validEvent("11111111-1111-1111-1111-111111111111"));

    await runOnce(f.store, { log: quiet });

    expect(f.leads.size).toBe(1);
    expect(f.events.size).toBe(1);
    expect(f.dlq.lead.every((r) => r.resolved)).toBe(true);
  });

  it("gives up at once on a payload that can never be stored, and pages for a lead", async () => {
    const logged: [string, string][] = [];
    const f = fakeStore({ leads: [{ ...validLead("x"), consent_text_version: undefined }] });

    await runOnce(f.store, { log: (level, event) => logged.push([level, event]) });

    const row = f.dlq.lead[0];
    expect(row?.resolved).toBe(false);
    expect(row?.attempts).toBe(5);
    expect(row?.last_error).toContain("consent_text_version");
    expect(logged).toContainEqual(["error", "lead_dlq_gave_up"]);
  });

  it("counts one attempt for a transient failure and leaves the row for the next sweep", async () => {
    const f = fakeStore({
      events: [validEvent("11111111-1111-1111-1111-111111111111")],
      failEventStore: true,
    });

    await runOnce(f.store, { log: quiet });

    expect(f.dlq.event[0]?.resolved).toBe(false);
    expect(f.dlq.event[0]?.attempts).toBe(1);
    expect(f.dlq.event[0]?.last_error).toContain("57P01");
  });

  it("sweeps in batches and comes back for the rest on the next run", async () => {
    const many = Array.from({ length: SWEEP_BATCH + 5 }, (_, i) =>
      validEvent(`11111111-1111-1111-1111-${String(i).padStart(12, "0")}`),
    );
    const f = fakeStore({ events: many });

    await runOnce(f.store, { log: quiet });
    expect(f.events.size).toBe(SWEEP_BATCH);

    await runOnce(f.store, { log: quiet });
    expect(f.events.size).toBe(SWEEP_BATCH + 5);
  });

  it("fails an unconfigured routing job with a reason staff can read, rather than dropping it", async () => {
    const f = fakeStore();
    f.jobs.push({
      id: "j-email",
      kind: "notify-lead-email",
      payload: { lead_id: "lead-1" },
      attempts: 0,
      max_attempts: 5,
      lease_token: "",
      status: "pending",
      dedupe_key: "lead-1",
    });

    const summary = await runOnce(f.store, { log: quiet });

    expect(summary.failed).toBe(1);
    expect(f.jobs[0]?.status).toBe("pending");
    expect(f.jobs[0]?.last_error).toContain("not configured");
  });

  it("times out a hung handler instead of holding the run", async () => {
    const f = fakeStore();
    f.jobs.push({
      id: "j-hang",
      kind: "retry-event-dlq",
      payload: {},
      attempts: 0,
      max_attempts: 5,
      lease_token: "",
      status: "pending",
      dedupe_key: null,
    });

    const summary = await runOnce(f.store, {
      log: quiet,
      jobTimeoutMs: 20,
      handlers: { "retry-event-dlq": () => new Promise(() => {}) },
    });

    expect(summary.failed).toBe(1);
    expect(f.jobs[0]?.last_error).toContain("timed out");
  });

  it("stops claiming once the time budget is spent", async () => {
    const f = fakeStore({ events: [validEvent("11111111-1111-1111-1111-111111111111")] });
    let t = 0;

    const summary = await runOnce(f.store, { log: quiet, budgetMs: 10, now: () => (t += 100) });

    expect(summary.claimed).toBe(0);
    expect(f.jobs[0]?.status).toBe("pending");
  });

  it("does not treat a refused completion (lease lost) as success", async () => {
    const f = fakeStore({ events: [validEvent("11111111-1111-1111-1111-111111111111")] });
    const store: WorkerStore = {
      ...f.store,
      completeJob: async () => {
        throw new Error("lease lost");
      },
    };

    const summary = await runOnce(store, { log: quiet });

    expect(summary.succeeded).toBe(0);
    expect(summary.failed).toBe(1);
  });
});
