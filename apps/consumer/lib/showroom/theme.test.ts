import { describe, expect, it } from "vitest";
import type { BrandThemeRow } from "@autoverse/engine-core";
import { demoCatalog } from "./fixtures/demo-catalog";
import { themeCss } from "./theme";

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
    const bad = { ...theme, on_accent: "grey" } as unknown as BrandThemeRow;
    expect(themeCss(bad)).toEqual({ ok: false, field: "on_accent" });
  });
});
