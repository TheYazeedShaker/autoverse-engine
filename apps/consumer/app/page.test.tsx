import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
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

  it("renders the skeleton: brand, from-price, on-request copy, draft hidden", async () => {
    const html = renderToStaticMarkup(await Page());
    expect(html).toContain("Demo Motors");
    expect(html).toMatch(/From EGP\s?3,900,000/);
    expect(html).toContain("Price on request");
    expect(html).not.toContain("Demo Draft");
    expect(html).not.toContain("From Price on request");
    expect(html).toContain("--av-accent:");
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
