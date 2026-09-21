import { describe, expect, it } from "vitest";
import type { CommandEnvelope, SignalEnvelope } from "./index";

// The real assertions are compile-time: each `@ts-expect-error` below MUST produce a type error.
// If a mismatched command/data pair ever typechecks, the directive becomes unused and
// `pnpm typecheck` fails — so this file guards the protocol's pairing guarantee (REV2 0-H.7).

const signalBase = {
  source: "nmesis-configurator",
  version: "1",
  brandId: "acme-motors",
  modelId: "am-7",
  sessionId: "s-1",
  timestamp: "2026-09-21T00:00:00.000Z",
} as const;

describe("configurator protocol envelopes", () => {
  it("accept a command paired with its own data", () => {
    const ok: CommandEnvelope = {
      source: "autoverse",
      version: "1",
      command: "set_option",
      data: { type: "exterior_color", value: "graphite" },
    };
    expect(ok.command).toBe("set_option");
  });

  it("reject a command paired with another command's data (compile-time)", () => {
    const bad: CommandEnvelope = {
      source: "autoverse",
      version: "1",
      command: "set_option",
      // @ts-expect-error — `init` data on a `set_option` command must not typecheck
      data: { mode: "light" },
    };
    expect(bad).toBeDefined();
  });

  it("narrow `data` from the discriminant", () => {
    const cmd = {
      source: "autoverse",
      version: "1",
      command: "set_view",
      data: { view: "rear" },
    } as CommandEnvelope;
    if (cmd.command === "set_view") expect(cmd.data.view).toBe("rear");
  });

  it("accept a signal paired with its own data, reject a mismatched one (compile-time)", () => {
    const ok: SignalEnvelope = { ...signalBase, event: "loading", data: { busy: true } };
    const bad: SignalEnvelope = {
      ...signalBase,
      event: "loading",
      // @ts-expect-error — `snapshot` data on a `loading` signal must not typecheck
      data: { imageDataUrl: "data:," },
    };
    expect([ok, bad]).toHaveLength(2);
  });
});
