import { describe, expect, it, vi } from "vitest";
import { ShowroomCatalog } from "./catalog-schema";
import { demoCatalog } from "./fixtures/demo-catalog";
import {
  CatalogHttpError,
  CatalogShapeError,
  configuredCatalogSource,
  supabaseCatalogSource,
  withHardTtlCache,
  type CatalogSource,
} from "./source";

const reply = (status: number, body: unknown) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch &
    ReturnType<typeof vi.fn>;

describe("supabaseCatalogSource", () => {
  it("calls showroom_catalog with the anon key, subdomain, signal and trace id, uncached", async () => {
    const fetchImpl = reply(200, demoCatalog());
    const signal = new AbortController().signal;
    const snapshot = await supabaseCatalogSource(
      "https://db.example.test/",
      "anon-key",
      fetchImpl,
    ).load("demo", signal, "trace-1");
    expect(snapshot?.brand.slug).toBe("demo");
    const [url, init] = fetchImpl.mock.calls[0]! as [string, RequestInit & { next?: unknown }];
    expect(url).toBe("https://db.example.test/rest/v1/rpc/showroom_catalog?p_subdomain=demo");
    expect(init.method).toBe("GET");
    expect(init.headers).toMatchObject({ apikey: "anon-key", authorization: "Bearer anon-key" });
    expect(init.signal).toBe(signal);
    expect(init.headers).toMatchObject({ "x-request-id": "trace-1" });
    // Never Next's data cache: it serves stale entries (ADR 0017). withHardTtlCache caches instead.
    expect(init.cache).toBe("no-store");
    expect(init.next).toBeUndefined();
  });

  it("returns null when the function returns null (unknown, dormant or not live)", async () => {
    expect(
      await supabaseCatalogSource("https://db.example.test", "k", reply(200, null)).load("x"),
    ).toBeNull();
  });

  it("throws on a non-2xx answer, carrying only the status", async () => {
    await expect(
      supabaseCatalogSource("https://db.example.test", "k", reply(503, { message: "down" })).load(
        "x",
      ),
    ).rejects.toEqual(new CatalogHttpError(503));
  });

  it("throws on a payload that breaks the contract, including an unexpected key", async () => {
    const extra = {
      ...demoCatalog(),
      market: { ...demoCatalog().market, lead_routing_emails: ["x"] },
    };
    const err = await supabaseCatalogSource("https://db.example.test", "k", reply(200, extra))
      .load("demo")
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CatalogShapeError);
    // It names where the contract broke, never the values.
    expect((err as CatalogShapeError).issues[0]).toMatchObject({ path: "market" });
    expect(JSON.stringify((err as CatalogShapeError).logFields())).not.toContain('x"');
    const missing = { ...demoCatalog(), vocabulary: undefined };
    await expect(
      supabaseCatalogSource("https://db.example.test", "k", reply(200, missing)).load("demo"),
    ).rejects.toBeInstanceOf(CatalogShapeError);
  });
});

describe("ShowroomCatalog schema", () => {
  it("accepts the demo payload and refuses a private storage path in place of a public one", () => {
    expect(ShowroomCatalog.safeParse(demoCatalog()).success).toBe(true);
    const leaky = demoCatalog() as unknown as { assets: Record<string, unknown>[] };
    leaky.assets[0] = { ...leaky.assets[0], storage_path: "private/x.png" };
    expect(ShowroomCatalog.safeParse(leaky).success).toBe(false);
  });

  it("refuses an unsafe public_path, as the database does", () => {
    for (const bad of [
      "../x.png",
      "a/../b.png",
      "/abs.png",
      "https://evil.test/x.png",
      "a//b.png",
    ]) {
      const snap = demoCatalog();
      snap.assets[0] = { ...snap.assets[0]!, public_path: bad };
      expect(ShowroomCatalog.safeParse(snap).success, bad).toBe(false);
    }
    const ok = demoCatalog();
    ok.assets[0] = { ...ok.assets[0]!, public_path: "demo/a1/v2/side..hash.png" };
    expect(ShowroomCatalog.safeParse(ok).success).toBe(true);
  });

  it("refuses a brand id on the brand object (condition 1: no internal ids beyond what's needed)", () => {
    const withId = { ...demoCatalog(), brand: { ...demoCatalog().brand, id: "b" } };
    expect(ShowroomCatalog.safeParse(withId).success).toBe(false);
  });
});

describe("configuredCatalogSource", () => {
  it("is null with nothing configured", async () => {
    expect(await configuredCatalogSource({ NODE_ENV: "development" })).toBeNull();
  });

  it("uses the database when SUPABASE_URL and SUPABASE_ANON_KEY are set", async () => {
    const source = await configuredCatalogSource({
      NODE_ENV: "production",
      VERCEL_ENV: "preview",
      SUPABASE_URL: "https://db.example.test",
      SUPABASE_ANON_KEY: "k",
    });
    expect(source).not.toBeNull();
  });

  it("never serves the fixture in a production build or on Vercel, even when asked", async () => {
    expect(
      await configuredCatalogSource({ NODE_ENV: "production", SHOWROOM_SOURCE: "fixture" }),
    ).toBeNull();
    for (const vercel of [{ VERCEL: "1" }, { VERCEL_ENV: "preview" }]) {
      expect(
        await configuredCatalogSource({
          NODE_ENV: "development",
          SHOWROOM_SOURCE: "fixture",
          ...vercel,
        }),
      ).toBeNull();
    }
  });

  it("serves the demo fixture locally when asked, for its own subdomain only", async () => {
    const source = await configuredCatalogSource({
      NODE_ENV: "development",
      SHOWROOM_SOURCE: "fixture",
    });
    expect((await source!.load("demo"))?.brand.slug).toBe("demo");
    expect(await source!.load("other")).toBeNull();
  });
});

describe("withHardTtlCache", () => {
  const counting = (value: ReturnType<typeof demoCatalog> | null = demoCatalog()) => {
    const load = vi.fn<CatalogSource["load"]>(async () => value);
    return { load, source: { load } as CatalogSource };
  };

  it("serves a hit inside the TTL and re-reads at the TTL: never a stale entry", async () => {
    let t = 0;
    const { load, source } = counting();
    const cached = withHardTtlCache(source, { ttlMs: 60_000, now: () => t });
    await cached.load("demo");
    t = 59_999;
    await cached.load("demo");
    expect(load).toHaveBeenCalledTimes(1);
    t = 60_000;
    await cached.load("demo");
    expect(load).toHaveBeenCalledTimes(2);
    // Even after a long quiet spell, the first request reads fresh.
    t = 10 * 60 * 60_000;
    await cached.load("demo");
    expect(load).toHaveBeenCalledTimes(3);
  });

  it("keys by subdomain, so one brand-market never answers for another", async () => {
    const load = vi.fn<CatalogSource["load"]>(async (s) => ({
      ...demoCatalog(),
      market: { ...demoCatalog().market, subdomain: s },
    }));
    const cached = withHardTtlCache({ load });
    expect((await cached.load("a"))?.market.subdomain).toBe("a");
    expect((await cached.load("b"))?.market.subdomain).toBe("b");
    expect((await cached.load("a"))?.market.subdomain).toBe("a");
  });

  it("caches a null answer, never an error", async () => {
    const nulls = counting(null);
    const c1 = withHardTtlCache(nulls.source);
    await c1.load("x");
    await c1.load("x");
    expect(nulls.load).toHaveBeenCalledTimes(1);

    const load = vi
      .fn<CatalogSource["load"]>()
      .mockRejectedValueOnce(new Error("down"))
      .mockResolvedValueOnce(demoCatalog());
    const c2 = withHardTtlCache({ load });
    await expect(c2.load("demo")).rejects.toThrow("down");
    expect((await c2.load("demo"))?.brand.slug).toBe("demo");
  });

  it("stamps an entry with when its read started, and a late older read never overwrites a newer one", async () => {
    let t = 0;
    const store = new Map<string, { at: number; value: ReturnType<typeof demoCatalog> | null }>();
    let releaseOld!: (v: ReturnType<typeof demoCatalog>) => void;
    const old = { ...demoCatalog(), brand: { slug: "demo", name: "Before unpublish" } };
    const fresh = { ...demoCatalog(), brand: { slug: "demo", name: "After unpublish" } };
    const load = vi
      .fn<CatalogSource["load"]>()
      .mockImplementationOnce(() => new Promise((r) => (releaseOld = r)))
      .mockResolvedValueOnce(fresh);
    const cached = withHardTtlCache({ load }, { ttlMs: 60_000, now: () => t, store });

    const a = cached.load("demo"); // read A starts at t=0 (before the unpublish)
    t = 1_000;
    await cached.load("demo"); // read B starts at t=1s and finishes first
    t = 2_000;
    releaseOld(old); // A finishes last
    await a;
    expect(store.get("demo")).toEqual({ at: 1_000, value: fresh });
    // And B's entry expires 60 s after B STARTED, not after it finished.
    t = 61_000;
    await cached.load("demo").catch(() => undefined);
    expect(load).toHaveBeenCalledTimes(3);
  });

  it("stays within its size bound, evicting the oldest", async () => {
    const { source } = counting();
    const store = new Map();
    const cached = withHardTtlCache(source, { maxEntries: 2, store });
    await cached.load("a");
    await cached.load("b");
    await cached.load("c");
    expect([...store.keys()]).toEqual(["b", "c"]);
  });
});
