import { describe, expect, it, vi } from "vitest";
import type { Logger } from "../log";
import { demoCatalog } from "./fixtures/demo-catalog";
import { loadShowroomPage, type LoadDeps } from "./load";
import { CatalogHttpError, CatalogShapeError, type CatalogSource } from "./source";
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

  it("is a 404 with no source configured", async () => {
    expect(await loadShowroomPage(deps({ source: null }))).toEqual({
      kind: "not_found",
      reason: "source_unconfigured",
    });
  });

  it("is a 404 when the source has no such brand-market (unknown, dormant or not live alike)", async () => {
    expect(await loadShowroomPage(deps({ host: "nobody.example.test" }))).toEqual({
      kind: "not_found",
      reason: "unknown_subdomain",
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

  it("does not retry a contract break, and logs which schema paths failed (never values)", async () => {
    const l = log();
    const load = vi.fn<CatalogSource["load"]>().mockRejectedValue(
      new CatalogShapeError([
        { path: ["market", "hotline"], code: "invalid_type" },
        { path: ["models", 0, "secret_col"], code: "unrecognized_keys" },
      ]),
    );
    expect(await loadShowroomPage(deps({ source: source(load), log: l }))).toEqual({
      kind: "unavailable",
    });
    expect(load).toHaveBeenCalledTimes(1);
    const line = l.mock.calls.find((c) => c[1] === "showroom_source_error")![2];
    expect(line).toMatchObject({
      error: "CatalogShapeError",
      retryable: false,
      issue_count: 2,
      issues: [
        { path: "market.hotline", code: "invalid_type" },
        { path: "models.0.secret_col", code: "unrecognized_keys" },
      ],
    });
  });

  it("logs the HTTP status; retries a 5xx or 429 but not another 4xx", async () => {
    const l = log();
    const unauthorized = vi
      .fn<CatalogSource["load"]>()
      .mockRejectedValue(new CatalogHttpError(401));
    await loadShowroomPage(deps({ source: source(unauthorized), log: l }));
    expect(unauthorized).toHaveBeenCalledTimes(1);
    expect(l.mock.calls.find((c) => c[1] === "showroom_source_error")![2]).toMatchObject({
      status: 401,
      retryable: false,
    });

    for (const status of [503, 429]) {
      const flaky = vi
        .fn<CatalogSource["load"]>()
        .mockRejectedValueOnce(new CatalogHttpError(status))
        .mockResolvedValueOnce(demoCatalog());
      expect((await loadShowroomPage(deps({ source: source(flaky) }))).kind).toBe("ok");
      expect(flaky).toHaveBeenCalledTimes(2);
    }
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

  it("on a Vercel preview host, shows the configured preview brand-market", async () => {
    const l = log();
    const load = vi.fn(fixture.load);
    const out = await loadShowroomPage(
      deps({
        host: "consumer-git-feat-x-team.vercel.app",
        previewSubdomain: "demo",
        source: source(load),
        log: l,
      }),
    );
    expect(out.kind).toBe("ok");
    expect(load).toHaveBeenCalledWith("demo", expect.anything(), undefined);
    expect(l.mock.calls.map((c) => c[1])).toContain("showroom_preview_mapping");
  });

  it("never applies the preview mapping to a non-vercel.app host, or when it isn't configured", async () => {
    expect(await loadShowroomPage(deps({ host: "evil.test", previewSubdomain: "demo" }))).toEqual({
      kind: "not_found",
      reason: "host_unresolved",
    });
    expect(
      await loadShowroomPage(
        deps({ host: "consumer-abc-team.vercel.app", previewSubdomain: null }),
      ),
    ).toEqual({ kind: "not_found", reason: "host_unresolved" });
  });

  it("a real brand host still wins over the preview mapping", async () => {
    const load = vi.fn(fixture.load);
    await loadShowroomPage(deps({ previewSubdomain: "other", source: source(load) }));
    expect(load).toHaveBeenCalledWith("demo", expect.anything(), undefined);
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
