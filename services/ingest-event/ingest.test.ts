import { describe, expect, it } from "vitest";
import { MAX_ATTEMPTS, decide, decideBatch, planReplay } from "./ingest";

const valid = {
  id: "11111111-1111-1111-1111-111111111111",
  brand_id: "22222222-2222-2222-2222-222222222222",
  kind: "configurator.opened",
};

describe("decide", () => {
  it("accepts a minimal valid event and defaults its payload", () => {
    const decision = decide(valid);
    expect(decision.outcome).toBe("accept");
    if (decision.outcome === "accept") expect(decision.event.payload).toEqual({});
  });

  it("dead-letters anything invalid instead of throwing", () => {
    for (const bad of [
      null,
      "nope",
      { ...valid, id: "not-a-uuid" },
      { ...valid, brand_id: undefined },
      { ...valid, kind: "Configurator Opened" },
      { ...valid, market_code: "egypt" },
    ]) {
      const decision = decide(bad);
      expect(decision.outcome).toBe("dead-letter");
      if (decision.outcome === "dead-letter") expect(decision.error_message).toBeTruthy();
    }
  });

  it("keeps the source payload verbatim so a replay sends exactly what arrived", () => {
    const original = { ...valid, kind: "BAD KIND", extra: { nested: true } };
    const decision = decide(original);
    if (decision.outcome !== "dead-letter") throw new Error("expected a dead letter");
    expect(decision.source_payload).toEqual(original);
  });

  it("describes a failure by shape, never by content — payloads can carry PII", () => {
    const decision = decide({ ...valid, id: "not-a-uuid", email: "someone@example.com" });
    if (decision.outcome !== "dead-letter") throw new Error("expected a dead letter");
    expect(decision.error_message).toContain("id");
    expect(decision.error_message).not.toContain("someone@example.com");
  });
});

describe("decideBatch", () => {
  it("judges each event on its own, so one bad event cannot lose the good ones", () => {
    const decisions = decideBatch([valid, { ...valid, id: "broken" }]);
    expect(decisions.map((d) => d.outcome)).toEqual(["accept", "dead-letter"]);
  });

  it("refuses an empty or oversized batch", () => {
    expect(decideBatch([])[0]!.outcome).toBe("dead-letter");
    const oversized = Array.from({ length: 101 }, () => valid);
    expect(decideBatch(oversized)[0]!.outcome).toBe("dead-letter");
  });

  it("treats a single object as a batch of one", () => {
    expect(decideBatch(valid)).toHaveLength(1);
  });
});

describe("planReplay", () => {
  it("replays a dead letter that now validates", () => {
    const plan = planReplay({ id: "dlq-1", source_payload: valid, attempts: 1 });
    expect(plan.action).toBe("replay");
  });

  it("gives up after the attempt limit rather than spinning forever", () => {
    const plan = planReplay({ id: "dlq-1", source_payload: valid, attempts: MAX_ATTEMPTS });
    expect(plan.action).toBe("give-up");
    if (plan.action === "give-up") expect(plan.reason).toContain(String(MAX_ATTEMPTS));
  });

  it("gives up on a payload that will never validate, and says why", () => {
    const plan = planReplay({ id: "dlq-1", source_payload: { nonsense: true }, attempts: 0 });
    expect(plan.action).toBe("give-up");
    if (plan.action === "give-up") expect(plan.reason).toContain("id");
  });
});
