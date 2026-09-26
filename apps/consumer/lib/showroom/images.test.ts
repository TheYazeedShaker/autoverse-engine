import { describe, expect, it } from "vitest";
import { assetBase, assetUrl } from "./images";

const BASE = "https://cdn.example.test/storage/v1/object/public/showroom-public";

describe("assetBase", () => {
  it("normalises to a trailing slash", () => {
    expect(assetBase(BASE)?.href).toBe(`${BASE}/`);
    expect(assetBase(`${BASE}/`)?.href).toBe(`${BASE}/`);
  });

  it("is null when unset or not a plain http(s) URL", () => {
    expect(assetBase(undefined)).toBeNull();
    expect(assetBase("")).toBeNull();
    expect(assetBase("not a url")).toBeNull();
    expect(assetBase("ftp://x.test/a/")).toBeNull();
    expect(assetBase("http://cdn.example.test/public/showroom-public/")).toBeNull();
    // A bare host would widen the image optimiser to everything on it.
    expect(assetBase("https://cdn.example.test")).toBeNull();
    expect(assetBase("https://cdn.example.test/")).toBeNull();
    expect(assetBase(`${BASE}?token=x`)).toBeNull();
  });
});

describe("assetUrl", () => {
  const base = assetBase(BASE);

  it("joins a key under the base", () => {
    expect(assetUrl("demo/lyriq/signature-luxury-side.png", base)).toBe(
      `${BASE}/demo/lyriq/signature-luxury-side.png`,
    );
  });

  it("never leaves the base: traversal, absolute paths and URLs are refused", () => {
    for (const bad of [
      "../other/x.png",
      "a/../../x.png",
      "/abs.png",
      "https://evil.test/x.png",
      "//evil.test/x.png",
      "a//b.png",
    ]) {
      expect(assetUrl(bad, base), bad).toBeNull();
    }
  });

  it("is null without a configured base", () => {
    expect(assetUrl("demo/x.png", null)).toBeNull();
  });
});
