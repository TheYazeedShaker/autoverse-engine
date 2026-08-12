import { describe, expect, it } from "vitest";
import { AA, contrastRatio } from "./contrast";
import { status, surfaces, palette } from "./tokens";

// §4.2 — the contrast rule as a structural invariant.
// Every registered surface MUST carry a non-null fg + fgMute, and BOTH must meet WCAG AA
// (≥ 4.5:1 normal text) against the surface's own background. Adding a surface without a
// passing foreground fails the build here — dark-on-dark becomes unrepresentable.
describe("surface ↔ foreground pairing invariant (§4.2)", () => {
  for (const [name, s] of Object.entries(surfaces)) {
    describe(`surface "${name}"`, () => {
      it("declares a non-null fg and fgMute", () => {
        expect(s.fg, `${name}.fg`).toBeTruthy();
        expect(s.fgMute, `${name}.fgMute`).toBeTruthy();
      });

      it(`fg meets AA on its background (≥ ${AA.normal}:1)`, () => {
        const ratio = contrastRatio(s.fg, s.bg);
        expect(
          ratio,
          `${name}: fg ${s.fg} on ${s.bg} = ${ratio.toFixed(2)}:1`,
        ).toBeGreaterThanOrEqual(AA.normal);
      });

      it(`fgMute meets AA on its background (≥ ${AA.normal}:1)`, () => {
        const ratio = contrastRatio(s.fgMute, s.bg);
        expect(
          ratio,
          `${name}: fgMute ${s.fgMute} on ${s.bg} = ${ratio.toFixed(2)}:1`,
        ).toBeGreaterThanOrEqual(AA.normal);
      });
    });
  }
});

// Status solids are used as borders / icons / strong state text on the light canvas — they are
// UI/large usage, so they must clear AA-large (≥ 3:1) against Mist.
describe("status solids are legible on the light canvas (§R1.2)", () => {
  for (const [name, color] of Object.entries(status)) {
    it(`status.${name} meets AA-large on Mist (≥ ${AA.large}:1)`, () => {
      const ratio = contrastRatio(color, palette.mist);
      expect(
        ratio,
        `status.${name} ${color} on Mist = ${ratio.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(AA.large);
    });
  }
});
