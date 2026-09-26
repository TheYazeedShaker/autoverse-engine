import { describe, expect, it } from "vitest";
import { configuredCatalogSource } from "./source";

describe("configuredCatalogSource", () => {
  it("is null by default: no database-backed source until the read path is decided", async () => {
    expect(await configuredCatalogSource({ NODE_ENV: "development" })).toBeNull();
  });

  it("never serves the fixture in a production build, even when asked", async () => {
    expect(
      await configuredCatalogSource({ NODE_ENV: "production", SHOWROOM_SOURCE: "fixture" }),
    ).toBeNull();
  });

  it("never serves the fixture on a Vercel deployment, whatever NODE_ENV says", async () => {
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
