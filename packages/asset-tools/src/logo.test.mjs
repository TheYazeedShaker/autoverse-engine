import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { checkLogo, logoObjectName, logoSql } from "./logo.mjs";

const svg = (body) =>
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 20">${body}</svg>`);
const PLAIN = svg('<path fill="#fff" d="M0 0h100v20H0z"/><use href="#a"/>');

describe("checkLogo", () => {
  it("accepts a plain SVG and a transparent PNG", async () => {
    expect(await checkLogo("logo.svg", PLAIN)).toBe("svg");
    const png = await sharp({
      create: { width: 4, height: 4, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .png()
      .toBuffer();
    expect(await checkLogo("logo.png", png)).toBe("png");
  });

  it("refuses an SVG that could run script or load something when opened directly", async () => {
    for (const bad of [
      "<script>alert(1)</script>",
      '<rect onload="alert(1)"/>',
      '<a href="javascript:alert(1)"><rect/></a>',
      "<foreignObject><div/></foreignObject>",
      '<image href="https://tracker.example/x.png"/>',
      '<use xlink:href="other.svg#a"/>',
      "<style>@import url(https://x.example/a.css)</style>",
      '<a><animate attributeName="href" to="&#106;avascript:alert(1)"/><rect/></a>',
      '<set attributeName="href" to="x"/>',
    ]) {
      await expect(checkLogo("logo.svg", svg(bad))).rejects.toThrow(/the SVG contains/);
    }
  });

  it("refuses other formats, fakes, and an opaque PNG", async () => {
    await expect(checkLogo("logo.jpg", Buffer.from("x"))).rejects.toThrow(/\.svg or \.png/);
    await expect(checkLogo("logo.png", Buffer.from("not a png"))).rejects.toThrow(
      /not a valid PNG/,
    );
    await expect(checkLogo("logo.svg", Buffer.from("<html></html>"))).rejects.toThrow(/not an SVG/);
    const opaque = await sharp({
      create: { width: 4, height: 4, channels: 3, background: "#ffffff" },
    })
      .png()
      .toBuffer();
    await expect(checkLogo("logo.png", opaque)).rejects.toThrow(/no transparency/);
  });
});

describe("logoObjectName", () => {
  it("is {brand}/_brand/logo-{variant}.{hash8}.{ext}, and the hash follows the content", () => {
    const a = logoObjectName("demo", "light", Buffer.from("one"), "svg");
    expect(a).toMatch(/^demo\/_brand\/logo-light\.[0-9a-f]{8}\.svg$/);
    expect(logoObjectName("demo", "light", Buffer.from("two"), "svg")).not.toBe(a);
    // The same shape the database CHECK accepts (migration 20260928100000).
    expect(a).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*\/_brand\/logo-light\.[0-9a-f]{8}\.(svg|png)$/);
    expect(() => logoObjectName("Demo", "light", Buffer.from("x"), "svg")).toThrow();
    expect(() => logoObjectName("demo", "mono", Buffer.from("x"), "svg")).toThrow();
  });
});

describe("logoSql", () => {
  it("sets the logo on every market theme of the brand, and shows the result", () => {
    const sql = logoSql("demo", [{ variant: "light", key: "demo/_brand/logo-light.a1b2c3d4.svg" }]);
    expect(sql).toContain(
      "update public.brand_themes set logo_light_asset_ref = 'demo/_brand/logo-light.a1b2c3d4.svg'",
    );
    expect(sql).toContain("where brand_id = (select id from public.brands where slug = 'demo')");
    expect(sql).toContain("begin;");
    expect(sql).toContain("commit;");
  });
});
