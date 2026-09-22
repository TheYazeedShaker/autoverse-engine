import { describe, expect, it } from "vitest";
import {
  AA_NORMAL,
  CANVAS_MIST,
  WHITE,
  BLACK,
  checkAa,
  contrastRatio,
  deriveTheme,
  validateThemeRequest,
} from "./theme";

const req = (accent: string) => ({
  brand_id: "11111111-2222-3333-4444-555555555555",
  market_code: "EG",
  accent_hex: accent,
});

describe("contrast", () => {
  it("matches the WCAG reference points", () => {
    expect(contrastRatio(BLACK, WHITE)).toBeCloseTo(21, 5);
    expect(contrastRatio(WHITE, WHITE)).toBeCloseTo(1, 5);
    // A mid grey against white, from the WCAG worked examples.
    expect(contrastRatio("#767676", WHITE)).toBeGreaterThanOrEqual(AA_NORMAL);
    expect(contrastRatio("#777777", WHITE)).toBeLessThan(AA_NORMAL);
  });
});

describe("deriveTheme", () => {
  it("puts white text on a dark accent and black text on a light one", () => {
    expect(deriveTheme("#0B3D2E").on_accent).toBe("white");
    expect(deriveTheme("#FFD60A").on_accent).toBe("black");
  });

  it("moves hover away from the text colour, never towards it", () => {
    const dark = deriveTheme("#0B3D2E");
    expect(contrastRatio(WHITE, dark.hover_hex)).toBeGreaterThanOrEqual(
      contrastRatio(WHITE, dark.accent_hex),
    );
    const light = deriveTheme("#FFD60A");
    expect(contrastRatio(BLACK, light.hover_hex)).toBeGreaterThanOrEqual(
      contrastRatio(BLACK, light.accent_hex),
    );
  });

  it("keeps the focus ring visible against the canvas", () => {
    for (const accent of ["#0B3D2E", "#7A0C2E", "#123C8C"]) {
      expect(contrastRatio(deriveTheme(accent).focus_hex, CANVAS_MIST)).toBeGreaterThanOrEqual(3);
    }
  });

  it("derives a muted tint that stays close to the canvas", () => {
    const { muted_hex } = deriveTheme("#0B3D2E");
    expect(contrastRatio(muted_hex, CANVAS_MIST)).toBeLessThan(2);
  });

  it("is deterministic and returns uppercase hex", () => {
    expect(deriveTheme("#0b3d2e")).toEqual(deriveTheme("#0B3D2E"));
    expect(deriveTheme("#0b3d2e").accent_hex).toBe("#0B3D2E");
  });
});

describe("validateThemeRequest", () => {
  it("accepts an accent that clears every pair", () => {
    const result = validateThemeRequest(req("#0B3D2E"));
    expect(result.ok).toBe(true);
    if (result.ok) expect(checkAa(result.theme)).toEqual([]);
  });

  it("rejects a too-light accent and names the failing pair", () => {
    // Pale yellow: fine behind black text, unreadable AS text on Mist or white.
    const result = validateThemeRequest(req("#FFD60A"));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(422);
      expect(result.error).toContain("accent text on the Mist canvas");
      expect(result.failures?.some((f) => f.pair.includes("white surface"))).toBe(true);
    }
  });

  it("rejects bad input shapes with 400, not 422", () => {
    for (const body of [
      null,
      "nope",
      { ...req("#0B3D2E"), brand_id: "not-a-uuid" },
      { ...req("#0B3D2E"), market_code: "egypt" },
      { ...req("#0B3D2E"), accent_hex: "green" },
      { ...req("#0B3D2E"), accent_hex: "#ABC" },
    ]) {
      const result = validateThemeRequest(body);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.status).toBe(400);
    }
  });

  it("accepts pure black — a brand may choose an invisible wedge tint", () => {
    // The REV says this is acceptable and documented: black buttons, no visible tint.
    const result = validateThemeRequest(req("#000000"));
    expect(result.ok).toBe(true);
  });
});
