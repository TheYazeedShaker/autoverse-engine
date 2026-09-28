import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { demoCatalog } from "../lib/showroom/fixtures/demo-catalog";

// The page's wiring: outcome → 404 / error / render, the flag it asks for, the trace id it tags.

const state = vi.hoisted(() => ({
  host: "demo.example.test" as string | null,
  flag: vi.fn(async (..._args: unknown[]) => true),
  source: null as null | { load: (s: string) => Promise<unknown> },
  setTag: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: async () =>
    new Headers(
      Object.fromEntries(
        [
          ["host", state.host],
          ["x-vercel-id", "fra1::trace-1"],
        ].filter(([, v]) => v !== null) as [string, string][],
      ),
    ),
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("@sentry/nextjs", () => ({ getIsolationScope: () => ({ setTag: state.setTag }) }));
vi.mock("../lib/flags", () => ({
  FLAGS: { pageShowroom: "page_showroom", pageCompare: "page_compare" },
  isFlagEnabled: (...args: unknown[]) => state.flag(...args),
}));
// next/image's host checks and loader only exist inside Next; a plain <img> keeps the URL visible.
vi.mock("next/image", () => ({
  default: ({
    src,
    alt,
    fetchPriority,
    loading,
  }: {
    src: string;
    alt: string;
    fetchPriority?: "high" | "low" | "auto";
    loading?: "eager" | "lazy";
  }) => <img src={src} alt={alt} fetchPriority={fetchPriority} loading={loading} />,
}));
vi.mock("../lib/showroom/source", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/showroom/source")>()),
  configuredCatalogSource: async () => state.source,
}));

const { default: Page } = await import("./page");

describe("showroom page", () => {
  beforeEach(() => {
    vi.stubEnv("CONSUMER_ROOT_DOMAIN", "example.test");
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    state.host = "demo.example.test";
    state.flag.mockClear();
    state.flag.mockImplementation(async () => true);
    state.source = { load: async (s) => (s === "demo" ? demoCatalog() : null) };
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("renders the range: a section per model, a card per trim, prices, the brand theme", async () => {
    const html = renderToStaticMarkup(await Page());
    expect(html).toContain("Demo Motors · Model Range");
    expect(html).toContain('id="demo-suv"');
    expect(html).toContain('id="demo-ev"');
    expect(html.match(/<article/g)).toHaveLength(3);
    expect(html).toContain("Demo SUV Sport");
    expect(html).toMatch(/From EGP\s?3,900,000/);
    expect(html).toContain("Price on request");
    expect(html).not.toContain("From Price on request");
    expect(html).toContain("--av-accent:");
  });

  it("shows real images from ASSET_BASE_URL, and the placeholder where a trim has none", async () => {
    vi.stubEnv("ASSET_BASE_URL", "https://cdn.example.test/public/showroom-public/");
    const html = renderToStaticMarkup(await Page());
    expect(html).toContain(
      'src="https://cdn.example.test/public/showroom-public/demo/a1/b1-side.png"',
    );
    expect(html).toContain('alt="Demo SUV Base, side view"');
    // The EV's only trim has a side image, the SUV Sport falls back to the model's: every card has one.
    const sideFrames = html.split('data-car-frame="side"').slice(1);
    expect(sideFrames.length).toBeGreaterThan(0);
    expect(sideFrames.every((f) => !f.slice(0, 400).includes("data-placeholder"))).toBe(true);
    // The hero: only the SUV Base has a front three-quarter image; the SUV Sport and the EV show the
    // placeholder in the same 16:9 box.
    expect(html.split('data-car-frame="front-34"').length - 1).toBe(3);
    expect(html.match(/data-placeholder/g)).toHaveLength(2);
  });

  it("makes the first hero image the one high-priority fetch", async () => {
    vi.stubEnv("ASSET_BASE_URL", "https://cdn.example.test/public/showroom-public/");
    const html = renderToStaticMarkup(await Page());
    // One <img> is high priority (React also emits a matching <link rel="preload"> for it).
    expect(html.match(/<img[^>]*fetchPriority="high"/gi) ?? []).toHaveLength(1);
    expect(html).toMatch(
      /<img[^>]*fetchpriority="high"[^>]*b1-front-34|<img[^>]*b1-front-34[^>]*fetchpriority="high"/i,
    );
  });

  it("without ASSET_BASE_URL, shows placeholders and logs it once per server instance", async () => {
    vi.stubEnv("ASSET_BASE_URL", "");
    // A fresh module instance, since the warning is logged once per process.
    vi.resetModules();
    const { default: FreshPage } = await import("./page");
    const warn = vi.spyOn(console, "warn");
    const html = renderToStaticMarkup(await FreshPage());
    expect(html).toContain("Image coming soon");
    renderToStaticMarkup(await FreshPage());
    const warnings = warn.mock.calls.filter(([line]) =>
      String(line).includes("showroom_asset_base_missing"),
    );
    expect(warnings).toHaveLength(1);
  });

  it("the dark bar never uses the logo for light surfaces (logo_light)", async () => {
    vi.stubEnv("ASSET_BASE_URL", "https://cdn.example.test/public/showroom-public/");
    const lightOnly = demoCatalog();
    lightOnly.theme!.logo_light_asset_ref = "demo/_brand/logo-light.a1b2c3d4.svg";
    state.source = { load: async () => lightOnly };
    const html = renderToStaticMarkup(await Page());
    const header = html.slice(html.indexOf("<header"), html.indexOf("</header>"));
    expect(header).not.toContain("logo-light");
    expect(header).toContain("Demo Motors"); // the wordmark
  });

  it("shows the logo for dark surfaces (logo_dark) on the dark bar as an <img>; the wordmark otherwise", async () => {
    vi.stubEnv("ASSET_BASE_URL", "https://cdn.example.test/public/showroom-public/");
    const withLogo = demoCatalog();
    withLogo.theme!.logo_dark_asset_ref = "demo/_brand/logo-dark.a1b2c3d4.svg";
    state.source = { load: async () => withLogo };
    const html = renderToStaticMarkup(await Page());
    expect(html).toMatch(
      /<header[^>]*>.*<img src="https:\/\/cdn\.example\.test\/public\/showroom-public\/demo\/_brand\/logo-dark\.a1b2c3d4\.svg" alt="Demo Motors"/s,
    );
    const header = html.slice(html.indexOf("<header"), html.indexOf("</header>"));
    expect(header).not.toContain("<svg"); // never inline: the logo is an <img>
    // Another brand's logo in this theme: dropped, the wordmark shows (and it is logged).
    const foreign = demoCatalog();
    foreign.theme!.logo_dark_asset_ref = "other/_brand/logo-dark.a1b2c3d4.svg";
    state.source = { load: async () => foreign };
    const html2 = renderToStaticMarkup(await Page());
    expect(html2).not.toContain("_brand/logo-dark");
    expect(html2).toMatch(/<header[^>]*>.*Demo Motors/s);
  });

  it("has the TopBar: wordmark, market chip, EN/AR links, and Book a test drive disabled", async () => {
    const html = renderToStaticMarkup(await Page());
    expect(html).toMatch(/<header[^>]*h-\(--av-topbar-height\)/);
    expect(html).toContain("Demo Motors");
    expect(html).toContain("EG · EGP");
    expect(html).toMatch(/<a[^>]*href="\?lang=en"[^>]*aria-current="true"/);
    expect(html).toMatch(/<a[^>]*href="\?lang=ar"/);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Book a Test Drive<\/button>/);
  });

  it("renders Arabic, right-to-left, with ?lang=ar", async () => {
    const html = renderToStaticMarkup(
      await Page({ searchParams: Promise.resolve({ lang: "ar" }) }),
    );
    expect(html).toContain('lang="ar" dir="rtl"');
    expect(html).toContain("التشكيلة");
    expect(html).toContain("ديمو إس يو في");
    expect(html).toContain("السعر عند الطلب");
  });

  it("asks page_showroom for the subdomain, with the request's trace id, and tags Sentry", async () => {
    await Page();
    expect(state.flag).toHaveBeenCalledWith(
      "page_showroom",
      "demo",
      undefined,
      undefined,
      "fra1::trace-1",
    );
    expect(state.setTag).toHaveBeenCalledWith("trace_id", "fra1::trace-1");
  });

  it("is a 404 when the flag is off or the host is unknown", async () => {
    state.flag.mockImplementation(async () => false);
    await expect(Page()).rejects.toThrow("NEXT_NOT_FOUND");
    state.flag.mockImplementation(async () => true);
    state.host = "nobody.example.test";
    await expect(Page()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("errors (not 404) when the catalogue can't be read", async () => {
    state.source = { load: async () => Promise.reject(new Error("db down")) };
    await expect(Page()).rejects.toThrow("showroom_unavailable");
  });
});

describe("showroom page: compare (slice 6)", () => {
  beforeEach(() => {
    vi.stubEnv("CONSUMER_ROOT_DOMAIN", "example.test");
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    state.host = "demo.example.test";
    state.source = { load: async (s) => (s === "demo" ? demoCatalog() : null) };
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("puts a Compare checkbox on every card, and asks page_compare for this subdomain", async () => {
    state.flag.mockImplementation(async () => true);
    state.flag.mockClear();
    const html = renderToStaticMarkup(await Page());
    expect(html.match(/type="checkbox"/g)?.length).toBe(3); // one per trim in the fixture
    expect(state.flag).toHaveBeenCalledWith(
      "page_compare",
      "demo",
      undefined,
      undefined,
      expect.any(String),
    );
  });

  it("still renders when page_compare is off (the tray works; Compare stays disabled)", async () => {
    state.flag.mockImplementation(async (flag) => flag === "page_showroom");
    const html = renderToStaticMarkup(await Page());
    expect(html).toContain('type="checkbox"');
  });
});
