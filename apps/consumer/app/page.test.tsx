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
  FLAGS: { pageShowroom: "page_showroom" },
  isFlagEnabled: (...args: unknown[]) => state.flag(...args),
}));
// next/image's host checks and loader only exist inside Next; a plain <img> keeps the URL visible.
vi.mock("next/image", () => ({
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
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
    expect(html).not.toContain("Image coming soon");
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
