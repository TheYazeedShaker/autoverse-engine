import { describe, expect, it } from "vitest";
import {
  MAX_ATTEMPTS,
  MAX_BODY_BYTES,
  MAX_PAYLOAD_BYTES,
  decide,
  decideBatch,
  MAX_EVENT_BYTES,
  findOversized,
  payloadBytes,
  planReplay,
  readCappedText,
} from "./ingest";

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

// BLOCK #9 (ADR 0016): 8 KB per payload, 256 KB per request, and size is refused, not dead-lettered.
describe("payload and body size", () => {
  // {"x":"aaa…"} as JSON.stringify writes it: 8 bytes of wrapping.
  const payloadOf = (bytes: number) => ({ x: "a".repeat(bytes - 8) });

  it("measures a payload as its UTF-8 JSON", () => {
    expect(payloadBytes(payloadOf(MAX_PAYLOAD_BYTES))).toBe(MAX_PAYLOAD_BYTES);
    expect(payloadBytes({ x: "é" })).toBe(10); // é is two bytes
  });

  it("accepts a payload at the limit and refuses one byte over", () => {
    expect(decide({ ...valid, payload: payloadOf(MAX_PAYLOAD_BYTES) }).outcome).toBe("accept");
    const over = decide({ ...valid, payload: payloadOf(MAX_PAYLOAD_BYTES + 1) });
    expect(over.outcome).toBe("dead-letter");
    if (over.outcome === "dead-letter") expect(over.error_message).toContain("payload");
  });

  it("finds an oversized payload, single or batched", () => {
    const big = { ...valid, payload: payloadOf(MAX_PAYLOAD_BYTES + 1) };
    expect(findOversized(big)).toEqual({ part: "payload", bytes: MAX_PAYLOAD_BYTES + 1 });
    expect(findOversized([valid, big])?.part).toBe("payload");
    expect(findOversized([valid, { ...valid, payload: payloadOf(MAX_PAYLOAD_BYTES) }])).toBeNull();
    // A non-object payload is measured too: it would be dead-lettered verbatim otherwise.
    expect(findOversized({ ...valid, payload: "a".repeat(MAX_PAYLOAD_BYTES) })?.part).toBe(
      "payload",
    );
    expect(findOversized(null)).toBeNull();
  });

  // An invalid event is dead-lettered verbatim, so its bulk can't hide outside `payload`.
  it("finds an event oversized as a whole, in any field or as a bare string", () => {
    const junk = "a".repeat(MAX_EVENT_BYTES);
    expect(findOversized({ ...valid, id: "not-a-uuid", junk })?.part).toBe("event");
    expect(findOversized([valid, junk])?.part).toBe("event");
    // A payload at its limit still fits inside the event limit.
    expect(findOversized({ ...valid, payload: payloadOf(MAX_PAYLOAD_BYTES) })).toBeNull();
  });

  it("gives up on replaying an oversized dead letter at once, instead of retrying it", () => {
    const plan = planReplay({
      id: "dlq-1",
      source_payload: { ...valid, payload: payloadOf(MAX_PAYLOAD_BYTES + 1) },
      attempts: 0,
    });
    expect(plan.action).toBe("give-up");
  });

  const stream = (...chunks: string[]) =>
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const c of chunks) controller.enqueue(new TextEncoder().encode(c));
        controller.close();
      },
    });

  it("reads a body up to the cap", async () => {
    expect(await readCappedText(stream("ab", "cd"), 4)).toBe("abcd");
    expect(await readCappedText(null, 4)).toBe("");
  });

  it("stops reading as soon as a body passes the cap, whatever Content-Length said", async () => {
    let pulled = 0;
    const endless = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += 1;
        controller.enqueue(new Uint8Array(1024));
      },
    });
    expect(await readCappedText(endless, MAX_BODY_BYTES)).toBeNull();
    expect(pulled).toBeLessThanOrEqual(MAX_BODY_BYTES / 1024 + 2);
  });
});
