import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AA, contrastRatio, hexToRgb } from "./contrast";
import { glass, motion, palette } from "./tokens";

// Glass is a see-through tint, so "the surface" is whatever the page scrolls behind it. The contrast
// rule for glass: every foreground must clear AA against the tint composited (in sRGB, as the
// browser's color-mix and alpha blending do) over the worst backdrops, pure white and Onyx.

function composite(tint: string, alpha: number, backdrop: string): string {
  const t = hexToRgb(tint);
  const b = hexToRgb(backdrop);
  const mixed = t.map((c, i) => Math.round(alpha * c + (1 - alpha) * b[i]!));
  return "#" + mixed.map((c) => c.toString(16).padStart(2, "0")).join("");
}

describe("glass: foregrounds meet AA over any backdrop (ADR 0026)", () => {
  for (const [name, g] of Object.entries(glass)) {
    for (const backdrop of [palette.white, palette.mist, palette.panel, palette.onyx]) {
      for (const fg of g.fg) {
        it(`glass.${name}: ${fg} over ${backdrop}`, () => {
          const bg = composite(g.tint, g.alpha, backdrop);
          const ratio = contrastRatio(fg, bg);
          expect(ratio, `${fg} on ${bg} = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(AA.normal);
        });
      }
    }
  }

  it("the dock's glass is visibly translucent (at most 60% tint)", () => {
    expect(glass.light.alpha).toBeLessThanOrEqual(0.6);
  });

  it("tokens.css uses the same tint and alpha", () => {
    const css = readFileSync(new URL("./tokens.css", import.meta.url), "utf8");
    expect(css).toContain(`--av-glass-light-alpha: ${Math.round(glass.light.alpha * 100)}%;`);
    expect(css).toContain(
      "--av-glass-light: color-mix(in srgb, var(--av-mist) var(--av-glass-light-alpha), transparent);",
    );
    expect(glass.light.tint).toBe(palette.mist);
    expect(css).toContain(`--av-glass-dark-alpha: ${Math.round(glass.dark.alpha * 100)}%;`);
    expect(css).toContain(
      "--av-glass-dark: color-mix(in srgb, var(--av-gunmetal) var(--av-glass-dark-alpha), transparent);",
    );
  });

  it("the dock's names use the ink the glass test checks (on-surface is Onyx)", () => {
    const css = readFileSync(new URL("./tokens.css", import.meta.url), "utf8");
    expect(css).toContain("--av-on-surface: var(--av-onyx);");
    expect(glass.light.fg).toContain(palette.onyx);
  });
});

describe("motion tokens: TS and CSS agree, and they are the only ones (ADR 0026)", () => {
  const css = readFileSync(new URL("./tokens.css", import.meta.url), "utf8");
  const pairs: [string, string][] = [
    ["--av-dur-overlay", `${motion.durationOverlay}ms`],
    ["--av-ease-overlay", motion.easingOverlay],
    ["--av-dur-modal", `${motion.durationModal}ms`],
    ["--av-ease-modal", motion.easingModal],
    ["--av-dur-move", `${motion.durationMove}ms`],
    ["--av-ease-move", motion.easingMove],
    ["--av-dur-reveal", `${motion.durationReveal}ms`],
    ["--av-ease-reveal", motion.easingReveal],
    ["--av-stagger-reveal", `${motion.staggerReveal}ms`],
    ["--av-dur-curtain", `${motion.durationCurtain}ms`],
    ["--av-dur-curtain-hold", `${motion.durationCurtainHold}ms`],
    ["--av-dur-curtain-hold-max", `${motion.durationCurtainHoldMax}ms`],
    ["--av-delay-curtain-failsafe", `${motion.delayCurtainFailsafe}ms`],
  ];
  it.each(pairs)("%s", (name, value) => {
    expect(css).toContain(`${name}: ${value};`);
  });

  it("the TS motion object holds exactly the standard's keys", () => {
    expect(Object.keys(motion).sort()).toEqual(
      [
        "durationOverlay",
        "easingOverlay",
        "durationModal",
        "easingModal",
        "durationMove",
        "easingMove",
        "durationReveal",
        "easingReveal",
        "staggerReveal",
        "durationCurtain",
        "durationCurtainHold",
        "durationCurtainHoldMax",
        "delayCurtainFailsafe",
        "distanceEntrance",
        "distanceOverlay",
      ].sort(),
    );
  });

  it("no other duration or easing token exists", () => {
    const declared = [...css.matchAll(/(--av-(?:dur|ease|stagger|delay)[a-z-]*)[ ]*:/g)].map(
      (m) => m[1],
    );
    expect(new Set(declared)).toEqual(new Set(pairs.map(([n]) => n)));
  });

  it("never ease-in: every curve starts at full speed or eases in and out", () => {
    for (const curve of [
      motion.easingOverlay,
      motion.easingModal,
      motion.easingMove,
      motion.easingReveal,
    ]) {
      const [x1, y1] = curve.slice(13, -1).split(",").map(Number) as [number, number];
      // An ease-in curve starts slow: its first control point lies under the diagonal (y1 < x1).
      // The move curve is ease-in-out (symmetric), allowed for on-screen movement.
      if (curve !== motion.easingMove) expect(y1, curve).toBeGreaterThanOrEqual(x1);
    }
  });

  it("the curtain holds at least 1.2 s and the failsafe is above hold max + lift", () => {
    expect(motion.durationCurtainHold).toBe(1200);
    expect(motion.delayCurtainFailsafe).toBeGreaterThan(
      motion.durationCurtainHoldMax + motion.durationCurtain,
    );
  });
});
