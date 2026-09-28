import { describe, expect, it, vi } from "vitest";
import { submitLead, type CaptureDeps, type LeadSubmission } from "./capture";

const SUBMISSION: LeadSubmission = {
  full_name: "Mona Adel",
  phone: "+201012345678",
  city: "cairo",
  model_id: "00000000-0000-4000-8000-0000000000a1",
  trim_id: null,
  preferred_time: "this_week",
  type: "test_drive",
  submission_id: "3f2b8c1e-9d4a-4e7b-8a61-0c5d2e9f1a7b",
  consent_text_version: "eg-v1",
  consent_at: "2026-09-28T12:00:00.000Z",
};

const KEY = "pk_" + "A".repeat(32);

/** A fetch that answers each call with the next status (null = a network error). */
function fakeFetch(statuses: (number | null)[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fn = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const s = statuses[calls.length - 1];
    if (s === null || s === undefined) throw new TypeError("Failed to fetch");
    return new Response(null, { status: s });
  });
  return { fetch: fn as unknown as typeof fetch, calls };
}

function deps(statuses: (number | null)[], patch: Partial<CaptureDeps> = {}) {
  const f = fakeFetch(statuses);
  let n = 0;
  const getToken = vi.fn(async () => `token-${++n}`);
  const sleep = vi.fn(async (_ms: number) => {});
  const onRetry = vi.fn((_attempt: number) => {});
  const d: CaptureDeps = {
    url: "https://functions.example.test/functions/v1/capture-lead",
    captureKey: KEY,
    marketCode: "EG",
    traceId: "0c5d2e9f-1a7b-4e7b-8a61-3f2b8c1e9d4a",
    getToken,
    fetch: f.fetch,
    sleep,
    onRetry,
    ...patch,
  };
  return { d, calls: f.calls, getToken, sleep, onRetry };
}

const bodyOf = (init: RequestInit) => JSON.parse(String(init.body)) as Record<string, unknown>;
const headersOf = (init: RequestInit) => init.headers as Record<string, string>;

describe("submitLead: the page contract", () => {
  it("201: sends the contract's headers and body once", async () => {
    const { d, calls } = deps([201]);
    expect(await submitLead(SUBMISSION, d)).toEqual({ kind: "received", attempts: 1 });
    expect(calls).toHaveLength(1);
    const { url, init } = calls[0]!;
    expect(url).toBe(d.url);
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("omit");
    expect(headersOf(init)).toEqual({
      "content-type": "application/json",
      "x-autoverse-key": KEY,
      "x-autoverse-market": "EG",
      "x-trace-id": d.traceId,
    });
    expect(bodyOf(init)).toEqual({ ...SUBMISSION, turnstile_token: "token-1" });
    // The body never names the brand or market: the database resolves them from the headers.
    expect(bodyOf(init)).not.toHaveProperty("brand_id");
    expect(bodyOf(init)).not.toHaveProperty("market_code");
  });

  it("503 then 201: retries with backoff, the SAME submission_id and trace id, a FRESH token", async () => {
    const { d, calls, sleep, onRetry } = deps([503, null, 201]);
    expect(await submitLead(SUBMISSION, d)).toEqual({ kind: "received", attempts: 3 });
    expect(calls).toHaveLength(3);
    const bodies = calls.map((c) => bodyOf(c.init));
    expect(new Set(bodies.map((b) => b.submission_id))).toEqual(
      new Set([SUBMISSION.submission_id]),
    );
    expect(bodies.map((b) => b.turnstile_token)).toEqual(["token-1", "token-2", "token-3"]);
    expect(new Set(calls.map((c) => headersOf(c.init)["x-trace-id"]))).toEqual(
      new Set([d.traceId]),
    );
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([1000, 2000]);
    expect(onRetry.mock.calls.map((c) => c[0])).toEqual([2, 3]);
  });

  it("retries a gateway 502/504 and a network error too", async () => {
    const { d, calls } = deps([502, 504, null, 201]);
    expect((await submitLead(SUBMISSION, d)).kind).toBe("received");
    expect(calls).toHaveLength(4);
  });

  it("gives up after the last attempt: unavailable", async () => {
    const { d, calls, sleep } = deps([503, 503, 503, 503, 201]);
    expect(await submitLead(SUBMISSION, d)).toEqual({ kind: "unavailable", attempts: 4 });
    expect(calls).toHaveLength(4);
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([1000, 2000, 4000]);
  });

  it.each([
    [403, "verification_failed"],
    [409, "duplicate"],
    [422, "invalid"],
    [400, "invalid"],
    [429, "rate_limited"],
  ] as const)("%i is final (%s), never retried", async (status, kind) => {
    const { d, calls } = deps([status, 201]);
    expect(await submitLead(SUBMISSION, d)).toEqual({ kind, attempts: 1 });
    expect(calls).toHaveLength(1);
  });

  it("an unexpected status is final and reported with its code", async () => {
    const { d, calls } = deps([500, 201]);
    expect(await submitLead(SUBMISSION, d)).toEqual({
      kind: "unexpected",
      status: 500,
      attempts: 1,
    });
    expect(calls).toHaveLength(1);
  });

  it("no bot-check token: nothing is sent", async () => {
    const { d, calls } = deps([201], { getToken: async () => null });
    expect(await submitLead(SUBMISSION, d)).toEqual({ kind: "verification_failed", attempts: 1 });
    expect(calls).toHaveLength(0);
  });

  it("each attempt has a timeout signal", async () => {
    const { d, calls } = deps([201]);
    await submitLead(SUBMISSION, d);
    expect(calls[0]!.init.signal).toBeInstanceOf(AbortSignal);
  });
});

describe("submitLead: the page's own schema", () => {
  it("a payload the page built wrong is never sent, and is reported as unexpected", async () => {
    const { d, calls, getToken } = deps([201]);
    const outcome = await submitLead({ ...SUBMISSION, phone: "01012345678" }, d);
    expect(outcome).toEqual({ kind: "unexpected", status: 0, attempts: 0 });
    expect(calls).toHaveLength(0);
    expect(getToken).not.toHaveBeenCalled();
  });
});
