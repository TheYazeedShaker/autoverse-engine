import { describe, expect, it } from "vitest";
import { demoCatalog } from "./fixtures/demo-catalog";
import { logoPath, themeCss, type ThemeColours } from "./theme";

const theme = demoCatalog().theme!;

describe("themeCss", () => {
  it("emits the accent family as custom properties on :root", () => {
    expect(themeCss(theme)).toEqual({
      ok: true,
      css:
        ":root{--av-accent:#1f4e8c;--av-accent-hover:#173b69;" +
        "--av-accent-muted:#dce4ee;--av-focus-ring:#1f4e8c;--av-on-accent:white}",
    });
  });

  it("refuses anything that isn't a plain six-digit hex, naming the field", () => {
    expect(themeCss({ ...theme, accent_hex: "red" })).toEqual({ ok: false, field: "accent_hex" });
    expect(themeCss({ ...theme, hover_hex: "#000000;}body{display:none" })).toEqual({
      ok: false,
      field: "hover_hex",
    });
    expect(themeCss({ ...theme, focus_hex: "#FFF" })).toEqual({ ok: false, field: "focus_hex" });
  });

  it("refuses an on-accent value other than black or white", () => {
    const bad = { ...theme, on_accent: "grey" } as unknown as ThemeColours;
    expect(themeCss(bad)).toEqual({ ok: false, field: "on_accent" });
  });
});

describe("logoPath (ADR 0024)", () => {
  it("accepts this brand's hashed SVG or PNG key for the matching variant", () => {
    expect(logoPath("demo/_brand/logo-light.a1b2c3d4.svg", "light", "demo")).toBe(
      "demo/_brand/logo-light.a1b2c3d4.svg",
    );
    expect(logoPath("demo/_brand/logo-dark.0f9e8d7c.png", "dark", "demo")).toBe(
      "demo/_brand/logo-dark.0f9e8d7c.png",
    );
  });

  it("drops anything else, so the wordmark shows", () => {
    expect(logoPath(null, "light", "demo")).toBeNull();
    expect(logoPath("other/_brand/logo-light.a1b2c3d4.svg", "light", "demo")).toBeNull();
    expect(logoPath("demo/_brand/logo-dark.a1b2c3d4.svg", "light", "demo")).toBeNull();
    expect(logoPath("demo/_brand/logo-light.svg", "light", "demo")).toBeNull();
    expect(logoPath("demo/_brand/logo-light.a1b2c3d4.jpg", "light", "demo")).toBeNull();
    expect(
      logoPath("https://x.test/demo/_brand/logo-light.a1b2c3d4.svg", "light", "demo"),
    ).toBeNull();
  });
});
