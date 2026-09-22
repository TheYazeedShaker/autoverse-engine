import { describe, expect, it } from "vitest";
import { JOB_KINDS, backoffSeconds, dispatch, isTerminal } from "./dispatch";

const job = (over: Partial<Parameters<typeof dispatch>[0]> = {}) => ({
  id: "job-1",
  kind: "notify-lead-email",
  payload: { lead_id: "11111111-1111-1111-1111-111111111111" },
  attempts: 1,
  max_attempts: 5,
  ...over,
});

describe("dispatch", () => {
  it("runs every kind the spec lists", () => {
    for (const kind of JOB_KINDS) {
      const payload = kind.endsWith("dlq") ? {} : { lead_id: "x" };
      expect(dispatch(job({ kind, payload })).action).toBe("run");
    }
  });

  it("fails an unknown kind immediately instead of retrying it five times", () => {
    const result = dispatch(job({ kind: "send-carrier-pigeon" }));
    expect(result.action).toBe("fail");
    if (result.action === "fail") expect(result.reason).toContain("unknown job kind");
  });

  it("fails a job whose payload cannot be acted on", () => {
    const result = dispatch(job({ payload: {} }));
    expect(result.action).toBe("fail");
    if (result.action === "fail") expect(result.reason).toContain("lead_id");
  });

  it("treats an explicit null payload field as missing", () => {
    expect(dispatch(job({ payload: { lead_id: null } })).action).toBe("fail");
  });

  it("stops once the attempts are spent", () => {
    expect(dispatch(job({ attempts: 6, max_attempts: 5 })).action).toBe("fail");
    expect(isTerminal(job({ attempts: 5, max_attempts: 5 }))).toBe(true);
    expect(isTerminal(job({ attempts: 4, max_attempts: 5 }))).toBe(false);
  });
});

describe("backoff", () => {
  it("doubles, so a struggling downstream is not hammered", () => {
    expect([0, 1, 2, 3, 4].map(backoffSeconds)).toEqual([1, 2, 4, 8, 16]);
  });

  it("stops doubling, so a job cannot be scheduled for next century", () => {
    expect(backoffSeconds(50)).toBe(backoffSeconds(10));
  });
});
