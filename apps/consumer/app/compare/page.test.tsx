import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { demoCatalog } from "../../lib/showroom/fixtures/demo-catalog";

// The compare placeholder page: the same mocks as the showroom page test.

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
vi.mock("../../lib/flags", () => ({
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
vi.mock("../../lib/showroom/source", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/showroom/source")>()),
  configuredCatalogSource: async () => state.source,
}));

const { default: ComparePage } = await import("./page");

// The compare PLACEHOLDER route (slice 6): the showroom's gates, then its own flag; ?trims= is
// untrusted and only this catalogue's published trims are listed.

describe("compare page placeholder", () => {
  beforeEach(() => {
    vi.stubEnv("CONSUMER_ROOT_DOMAIN", "example.test");
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    state.host = "demo.example.test";
    state.source = { load: async (s) => (s === "demo" ? demoCatalog() : null) };
    state.flag.mockImplementation(async () => true);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  const trimIds = () => demoCatalog().trims.map((t) => t.id);

  it("is a 404 while page_compare is off (and for an unknown host)", async () => {
    state.flag.mockImplementation(async (flag) => flag === "page_showroom");
    await expect(ComparePage({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    state.flag.mockImplementation(async () => true);
    state.host = "nobody.example.test";
    await expect(ComparePage({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
  });

  const titlesIn = (html: string) =>
    [...html.matchAll(/<span class="text-base font-medium">([^<]+)<\/span>/g)].map((m) => m[1]);

  it("lists the picked pair, in order; junk in ?trims= is ignored", async () => {
    const [a, b] = trimIds();
    const html = renderToStaticMarkup(
      await ComparePage({
        searchParams: Promise.resolve({ trims: `${b},<script>,${a}` }),
      }),
    );
    expect(html).toContain("Compare models");
    expect(titlesIn(html)).toHaveLength(2);
    expect(html).not.toContain("script");
    expect(html).toContain("coming soon");
  });

  it("a trim this catalogue doesn't publish (e.g. another brand's) is left out", async () => {
    const [a] = trimIds();
    const html = renderToStaticMarkup(
      await ComparePage({
        searchParams: Promise.resolve({ trims: `00000000-0000-0000-0000-0000000000ff,${a}` }),
      }),
    );
    expect(titlesIn(html)).toHaveLength(1);
  });

  it("is Arabic with ?lang=ar", async () => {
    const html = renderToStaticMarkup(
      await ComparePage({
        searchParams: Promise.resolve({ lang: "ar", trims: trimIds().join(",") }),
      }),
    );
    expect(html).toContain('lang="ar" dir="rtl"');
    expect(html).toContain("قارن الطرازات");
  });
});
