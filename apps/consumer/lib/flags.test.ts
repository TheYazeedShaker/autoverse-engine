import { describe, expect, it, vi } from "vitest";
import { isFlagEnabled, type FlagClient } from "./flags";

const client = (impl: FlagClient["isFeatureEnabled"]): FlagClient => ({ isFeatureEnabled: impl });

describe("isFlagEnabled — fails closed", () => {
  it("is on only when PostHog explicitly says true", async () => {
    expect(
      await isFlagEnabled(
        "f",
        "id",
        client(async () => true),
      ),
    ).toBe(true);
  });

  it("is off when PostHog says false or has no answer", async () => {
    expect(
      await isFlagEnabled(
        "f",
        "id",
        client(async () => false),
      ),
    ).toBe(false);
    expect(
      await isFlagEnabled(
        "f",
        "id",
        client(async () => undefined),
      ),
    ).toBe(false);
  });

  it("is off when no PostHog key is configured (no client)", async () => {
    expect(await isFlagEnabled("f", "id", null)).toBe(false);
  });

  it("is off when PostHog throws — the kill path survives an outage", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const failing = client(async () => {
      throw new Error("network down");
    });
    expect(await isFlagEnabled("f", "id", failing)).toBe(false);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"event":"flag_eval_failed"'));
    warn.mockRestore();
  });

  it("is off when PostHog is slower than the timeout", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const slow = client(() => new Promise((resolve) => setTimeout(() => resolve(true), 200)));
    expect(await isFlagEnabled("f", "id", slow, 20)).toBe(false);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"reason":"timeout"'));
    warn.mockRestore();
  });
});
