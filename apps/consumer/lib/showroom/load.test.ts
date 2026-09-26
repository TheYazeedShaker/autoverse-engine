import { describe, expect, it, vi } from "vitest";
import type { Logger } from "../log";
import { demoCatalog } from "./fixtures/demo-catalog";
import { loadShowroomPage, type LoadDeps } from "./load";
import type { CatalogSource } from "./source";
import { themeCss } from "./theme";

const log = () => vi.fn() as unknown as Logger & { mock: { calls: unknown[][] } };
const source = (load: CatalogSource["load"]): CatalogSource => ({ load });
const fixture = source(async (sub) => (sub === "demo" ? demoCatalog() : null));

const deps = (over: Partial<LoadDeps> = {}): LoadDeps => ({
  host: "demo.example.test",
  rootDomain: "example.test",
  isEnabled: async () => true,
  source: fixture,
  log: log(),
  ...over,
});

describe("loadShowroomPage", () => {
  it("resolves host → brand-market and returns the view with the brand's theme", async () => {
    const out = await loadShowroomPage(deps());
    expect(out.kind).toBe("ok");
    if (out.kind !== "ok") return;
    expect(out.showroom.brand.slug).toBe("demo");
    const expected = themeCss(demoCatalog().theme!);
    expect(expected.ok && out.themeCss).toBe(expected.ok ? expected.css : "unreachable");
  });

  it("is a 404 for an unresolvable host, without asking the flag or the source", async () => {
    const isEnabled = vi.fn(async () => true);
    const load = vi.fn(fixture.load);
    const out = await loadShowroomPage(
      deps({ host: "evil.test", isEnabled, source: source(load) }),
    );
    expect(out).toEqual({ kind: "not_found", reason: "host_unresolved" });
    expect(isEnabled).not.toHaveBeenCalled();
    expect(load).not.toHaveBeenCalled();
  });

  it("logs a misconfiguration when the root domain is unset", async () => {
    const l = log();
    await loadShowroomPage(deps({ rootDomain: undefined, log: l }));
    expect(l.mock.calls[0]).toEqual([
      "error",
      "showroom_misconfigured",
      { missing: "CONSUMER_ROOT_DOMAIN" },
    ]);
  });

  it("kill path: flag off is a 404 and never reads the catalogue", async () => {
    const load = vi.fn(fixture.load);
    const isEnabled = vi.fn(async () => false);
    const out = await loadShowroomPage(deps({ isEnabled, source: source(load) }));
    expect(out).toEqual({ kind: "not_found", reason: "flag_off" });
    expect(isEnabled).toHaveBeenCalledWith("demo");
    expect(load).not.toHaveBeenCalled();
  });

  it("is a 404 with no source configured (the open read-path decision)", async () => {
    expect(await loadShowroomPage(deps({ source: null }))).toEqual({
      kind: "not_found",
      reason: "source_unconfigured",
    });
  });

  it("is the same 404 for an unknown subdomain and for a brand-market that isn't live", async () => {
    expect(await loadShowroomPage(deps({ host: "nobody.example.test" }))).toEqual({
      kind: "not_found",
      reason: "unknown_subdomain",
    });
    const dormant = source(async () => ({
      ...demoCatalog(),
      market: { ...demoCatalog().market, live: false },
    }));
    expect(await loadShowroomPage(deps({ source: dormant }))).toEqual({
      kind: "not_found",
      reason: "not_live",
    });
  });

  it("retries a failed read once, then succeeds", async () => {
    const load = vi
      .fn<CatalogSource["load"]>()
      .mockRejectedValueOnce(new Error("blip"))
      .mockResolvedValueOnce(demoCatalog());
    const out = await loadShowroomPage(deps({ source: source(load) }));
    expect(out.kind).toBe("ok");
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("is unavailable (not a 404) when both attempts fail or time out, and logs it", async () => {
    const l = log();
    const hang = source(() => new Promise(() => {}));
    const out = await loadShowroomPage(deps({ source: hang, timeoutMs: 5, log: l }));
    expect(out).toEqual({ kind: "unavailable" });
    const names = l.mock.calls.map((c) => c[1]);
    expect(names.filter((n) => n === "showroom_source_error")).toHaveLength(2);
    expect(names).toContain("showroom_load_failed");
  });

  it("aborts a timed-out attempt so it doesn't run beside the retry", async () => {
    const signals: AbortSignal[] = [];
    const hang = source((_sub, signal) => {
      signals.push(signal!);
      return new Promise(() => {});
    });
    await loadShowroomPage(deps({ source: hang, timeoutMs: 5 }));
    expect(signals).toHaveLength(2);
    expect(signals.every((s) => s.aborted)).toBe(true);
  });

  it("refuses a snapshot for a different subdomain than the host named (source bug)", async () => {
    const l = log();
    const wrong = source(async () => ({
      ...demoCatalog(),
      market: { ...demoCatalog().market, subdomain: "someone-else" },
    }));
    expect(await loadShowroomPage(deps({ source: wrong, log: l }))).toEqual({
      kind: "unavailable",
    });
    expect(l.mock.calls.map((c) => c[1])).toContain("showroom_source_mismatch");
  });

  it("never applies another brand-market's theme", async () => {
    const l = log();
    const foreignTheme = source(async () => ({
      ...demoCatalog(),
      theme: { ...demoCatalog().theme!, brand_id: "other-brand" },
    }));
    const out = await loadShowroomPage(deps({ source: foreignTheme, log: l }));
    expect(out.kind === "ok" && out.themeCss).toBeNull();
    expect(l.mock.calls.map((c) => c[1])).toContain("showroom_theme_mismatch");

    const otherMarket = source(async () => ({
      ...demoCatalog(),
      theme: { ...demoCatalog().theme!, market_code: "SA" },
    }));
    const out2 = await loadShowroomPage(deps({ source: otherMarket }));
    expect(out2.kind === "ok" && out2.themeCss).toBeNull();
  });

  it("renders in the neutral accent when the theme row is missing or invalid", async () => {
    const noTheme = source(async () => ({ ...demoCatalog(), theme: null }));
    const a = await loadShowroomPage(deps({ source: noTheme }));
    expect(a.kind === "ok" && a.themeCss).toBeNull();

    const l = log();
    const bad = source(async () => ({
      ...demoCatalog(),
      theme: { ...demoCatalog().theme!, accent_hex: "red" },
    }));
    const b = await loadShowroomPage(deps({ source: bad, log: l }));
    expect(b.kind === "ok" && b.themeCss).toBeNull();
    expect(l.mock.calls.map((c) => c[1])).toContain("showroom_theme_invalid");
  });
});
