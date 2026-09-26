import { describe, expect, it } from "vitest";
import { traceIdFrom } from "./log";

const headers = (h: Record<string, string>) => new Headers(h);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe("traceIdFrom", () => {
  it("uses the platform id first, then x-request-id", () => {
    expect(traceIdFrom(headers({ "x-vercel-id": "fra1::abc-123", "x-request-id": "r1" }))).toBe(
      "fra1::abc-123",
    );
    expect(traceIdFrom(headers({ "x-request-id": "r1" }))).toBe("r1");
  });

  it("replaces a spoofed, oversized or odd id with a fresh UUID", () => {
    expect(traceIdFrom(headers({ "x-request-id": "a".repeat(129) }))).toMatch(UUID);
    expect(traceIdFrom(headers({ "x-request-id": 'evil"},{"level":"x' }))).toMatch(UUID);
    expect(traceIdFrom(headers({}))).toMatch(UUID);
  });
});
