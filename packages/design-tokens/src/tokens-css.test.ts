import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AA, contrastRatio } from "./contrast";
import { borderWidth, radius, space } from "./tokens";

// Companion to surfaces.test.ts: tokens.css is the CANONICAL web source, so its surface↔foreground
// pairs must clear AA too — not just the TS registry. This parses the CSS, resolves var() chains to
// hex, and asserts each pair. A bad raw CSS pair (or TS↔CSS drift) fails the build here.

const css = readFileSync(new URL("./tokens.css", import.meta.url), "utf8");

/** Map every `--av-*: value;` declaration to its raw value. */
const declarations = new Map<string, string>();
for (const m of css.matchAll(/(--av-[\w-]+)\s*:\s*([^;]+);/g)) {
  declarations.set(m[1]!, m[2]!.trim());
}

/** Resolve a CSS value (possibly a var() reference chain) down to a hex string. */
function resolveHex(value: string, seen = new Set<string>()): string {
  const v = value.trim();
  if (v.startsWith("#")) return v;
  const ref = /^var\(\s*(--[\w-]+)\s*\)$/.exec(v);
  if (ref) {
    const name = ref[1]!;
    if (seen.has(name)) throw new Error(`Cyclic var reference: ${name}`);
    seen.add(name);
    const next = declarations.get(name);
    if (!next) throw new Error(`Unresolved var: ${name}`);
    return resolveHex(next, seen);
  }
  throw new Error(`Not a colour value: ${value}`);
}

// Surface background var → its paired foreground vars (all are text → AA normal 4.5:1).
const surfacePairs: Record<string, string[]> = {
  // contextual pair (§7) — the :root default (light). This makes the "contrast stays structural" guarantee
  // enforced, not just true-by-aliasing. The dark re-publish (Surface tone="dark" / SB theme) maps these to
  // the on-dark / surface-dark tokens, whose AA is already asserted by the --av-surface-dark row below.
  "--av-bg": ["--av-fg", "--av-fg-muted"],
  "--av-surface": ["--av-on-surface", "--av-on-surface-soft", "--av-on-surface-muted"],
  "--av-surface-panel": ["--av-on-panel", "--av-on-panel-muted"],
  "--av-surface-card": ["--av-on-card", "--av-on-card-muted"],
  "--av-surface-dark": ["--av-on-dark", "--av-on-dark-soft", "--av-on-dark-muted"],

  "--av-surface-admin-sidebar": ["--av-on-admin", "--av-on-admin-muted"],
  "--av-surface-admin-base": ["--av-on-admin", "--av-on-admin-muted"],
  "--av-surface-admin": ["--av-on-admin", "--av-on-admin-muted"],
  "--av-surface-admin-raised": ["--av-on-admin", "--av-on-admin-muted"],
  "--av-surface-error": ["--av-on-error", "--av-on-error-muted"],
  "--av-surface-success": ["--av-on-success", "--av-on-success-muted"],
  "--av-surface-warning": ["--av-on-warning", "--av-on-warning-muted"],
  "--av-surface-info": ["--av-on-info", "--av-on-info-muted"],
};

describe("tokens.css surface ↔ foreground pairs meet AA (§4.2, canonical source)", () => {
  for (const [bgVar, fgVars] of Object.entries(surfacePairs)) {
    for (const fgVar of fgVars) {
      it(`${fgVar} on ${bgVar} meets AA (≥ ${AA.normal}:1)`, () => {
        const bg = resolveHex(declarations.get(bgVar) ?? `MISSING ${bgVar}`);
        const fg = resolveHex(declarations.get(fgVar) ?? `MISSING ${fgVar}`);
        const ratio = contrastRatio(fg, bg);
        expect(
          ratio,
          `${fgVar} ${fg} on ${bgVar} ${bg} = ${ratio.toFixed(2)}:1`,
        ).toBeGreaterThanOrEqual(AA.normal);
      });
    }
  }
});

describe("tokens.css scales match the TS registry (no drift)", () => {
  it("every space, radius and border-width token has the same value in CSS and TS", () => {
    for (const [k, v] of Object.entries(space))
      expect(declarations.get(`--av-space-${k}`)).toBe(`${v}px`);
    for (const [k, v] of Object.entries(radius))
      expect(declarations.get(`--av-radius-${k}`)).toBe(`${v}px`);
    expect(declarations.get("--av-border-width")).toBe(`${borderWidth.hairline}px`);
  });
});
