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
    for (const backdrop of [palette.white, palette.mist, palette.onyx]) {
      for (const [role, fg] of [
        ["fg", g.fg],
        ["fgSoft", g.fgSoft],
      ] as const) {
        it(`glass.${name}.${role} over ${backdrop}`, () => {
          const bg = composite(g.tint, g.alpha, backdrop);
          const ratio = contrastRatio(fg, bg);
          expect(ratio, `${fg} on ${bg} = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(AA.normal);
        });
      }
    }
  }

  it("tokens.css uses the same tint and alpha", () => {
    const css = readFileSync(new URL("./tokens.css", import.meta.url), "utf8");
    expect(css).toContain(`--av-glass-dark-alpha: ${Math.round(glass.dark.alpha * 100)}%;`);
    expect(css).toMatch(
      /--av-glass-dark: color-mix\(in srgb, var\(--av-gunmetal\) var\(--av-glass-dark-alpha\), transparent\);/,
    );
    expect(css.toLowerCase()).toContain(`--av-on-dark-soft: ${glass.dark.fgSoft.toLowerCase()};`);
  });
});

describe("motion tokens: TS and CSS agree", () => {
  const css = readFileSync(new URL("./tokens.css", import.meta.url), "utf8");
  it.each([
    ["--av-dur-overlay", `${motion.durationOverlay}ms`],
    ["--av-dur-reveal", `${motion.durationReveal}ms`],
    ["--av-dur-curtain", `${motion.durationCurtain}ms`],
    ["--av-dur-entrance", `${motion.durationEntrance}ms`],
    ["--av-dur-count", `${motion.durationCount}ms`],
    ["--av-stagger-reveal", `${motion.staggerReveal}ms`],
    ["--av-delay-entrance", `${motion.delayEntrance}ms`],
    ["--av-delay-curtain-failsafe", `${motion.delayCurtainFailsafe}ms`],
    ["--av-ease-emphasized", motion.easingEmphasized],
    ["--av-ease-reveal", motion.easingReveal],
    ["--av-ease-curtain", motion.easingCurtain],
    ["--av-ease-entrance", motion.easingEntrance],
    ["--av-ease-decelerate", motion.easingDecelerate],
  ])("%s", (name, value) => {
    expect(css).toContain(`${name}: ${value};`);
  });
});
