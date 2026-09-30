import { motion as tokens } from "@autoverse/tokens";
import { describe, expect, it } from "vitest";
import { overlayScrim, overlaySurface, type OverlayKind } from "./overlay-motion";

// The motion standard for overlays (ADR 0026), checked where it is applied.

const units = (t: string) => t.replace(/[-0-9.]+/g, "#");

describe("overlay motion", () => {
  it.each([
    ["side", tokens.durationOverlay],
    ["sheet", tokens.durationOverlay],
    ["modal", tokens.durationModal],
  ] as [OverlayKind, number][])(
    "%s: its token pair, the same for enter and exit, backdrop in sync",
    (kind, ms) => {
      const surface = overlaySurface(kind, "ltr", false);
      const scrim = overlayScrim(false, kind);
      expect(surface.transition.duration).toBe(ms / 1000);
      expect((surface.exit as { transition: unknown }).transition).toEqual(surface.transition);
      expect(scrim.transition).toEqual(surface.transition);
      expect((scrim.exit as { transition: unknown }).transition).toEqual(surface.transition);
    },
  );

  it("animates the transform property itself (compositor), with matching units at rest and away", () => {
    for (const kind of ["side", "sheet", "modal"] as OverlayKind[]) {
      const s = overlaySurface(kind, "ltr", false);
      const rest = (s.animate as { transform: string }).transform;
      const away = (s.initial as { transform: string }).transform;
      expect(rest.startsWith("translate(")).toBe(true);
      expect(units(away), `${kind}: ${away} vs ${rest}`).toBe(units(rest));
    }
  });

  it("drawer and sheet move by transform only; the modal also fades", () => {
    expect((overlaySurface("side", "ltr", false).initial as { opacity: number }).opacity).toBe(1);
    expect((overlaySurface("sheet", "ltr", false).initial as { opacity: number }).opacity).toBe(1);
    expect((overlaySurface("modal", "ltr", false).initial as { opacity: number }).opacity).toBe(0);
  });

  it("reduced motion: instant", () => {
    expect(overlaySurface("side", "rtl", true).transition).toEqual({ duration: 0 });
    expect(overlayScrim(true, "modal").transition).toEqual({ duration: 0 });
  });
});
