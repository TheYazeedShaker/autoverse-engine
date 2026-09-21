// Design-system CI gates (REV2 0-H.4). These are structural checks over the source, run by
// `pnpm test`, so they block a merge like any failing test. CLAUDE.md makes reduced motion "a
// blocking CI gate equal to contrast" and requires every primitive to pass axe.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const UI_SRC = join(__dirname);
const TOKENS_SRC = join(__dirname, "..", "..", "design-tokens", "src");
const COMPONENTS = join(UI_SRC, "components");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const isSource = (f: string) =>
  /\.(ts|tsx)$/.test(f) && !/\.(test|stories)\.tsx?$/.test(f) && !f.endsWith("gates.test.ts");

// ---------- reduced motion ----------

// A class token that animates: `transition`, `transition-colors`, `hover:animate-pulse`, …
// `motion-safe:` tokens only apply when the user has NOT asked for reduced motion, so they comply.
const TRANSITION = /^(?:[\w-]+:)*transition(?:-[a-z]+)?$/;
const ANIMATE = /^(?:[\w-]+:)*animate-(?!none$)[a-z-]+$/;

/** Class strings that animate without a reduced-motion counterpart in the SAME string. */
export function findMotionViolations(source: string): string[] {
  const strings = source.match(/"[^"\n]*"|'[^'\n]*'|`[^`]*`/g) ?? [];
  const bad: string[] = [];
  for (const raw of strings) {
    const tokens = raw.slice(1, -1).split(/\s+/).filter(Boolean);
    const moving = tokens.filter(
      (t) => !t.startsWith("motion-safe:") && !t.startsWith("motion-reduce:"),
    );
    if (
      moving.some((t) => TRANSITION.test(t)) &&
      !tokens.includes("motion-reduce:transition-none")
    ) {
      bad.push(`${raw} — add motion-reduce:transition-none`);
    }
    if (moving.some((t) => ANIMATE.test(t)) && !tokens.includes("motion-reduce:animate-none")) {
      bad.push(`${raw} — add motion-reduce:animate-none`);
    }
  }
  return bad;
}

/** Motion-library misuse: framer-motion is banned; motion/react must honour the user setting. */
export function findMotionLibraryViolations(source: string): string[] {
  const bad: string[] = [];
  if (/from\s+["']framer-motion["']/.test(source)) {
    bad.push("imports framer-motion — use motion/react (motion REV)");
  }
  if (
    /from\s+["']motion\/react["']/.test(source) &&
    !/useReducedMotion|MotionConfig/.test(source)
  ) {
    bad.push('uses motion/react without useReducedMotion or <MotionConfig reducedMotion="user">');
  }
  return bad;
}

/** CSS that animates must carry a prefers-reduced-motion: reduce block in the same file. */
export function cssNeedsReducedMotion(css: string): boolean {
  const animates = /@keyframes|(?:^|[;{\s])(?:animation|transition)(?:-[a-z-]+)?\s*:/m.test(css);
  return animates && !/prefers-reduced-motion:\s*reduce/.test(css);
}

describe("gate: reduced motion", () => {
  it("the detector catches what it should (self-test)", () => {
    expect(findMotionViolations(`cn("rounded transition-colors")`)).toHaveLength(1);
    expect(findMotionViolations(`<X className="animate-spin" />`)).toHaveLength(1);
    expect(findMotionViolations(`"hover:transition-shadow px-2"`)).toHaveLength(1);
    expect(findMotionViolations(`"transition-colors motion-reduce:transition-none"`)).toEqual([]);
    expect(findMotionViolations(`"animate-spin motion-reduce:animate-none"`)).toEqual([]);
    expect(findMotionViolations(`"motion-safe:animate-spin"`)).toEqual([]);
    expect(findMotionViolations(`"animate-none"`)).toEqual([]);
    expect(findMotionLibraryViolations(`import { motion } from "framer-motion";`)).toHaveLength(1);
    expect(findMotionLibraryViolations(`import { motion } from "motion/react";`)).toHaveLength(1);
    expect(
      findMotionLibraryViolations(`import { motion, useReducedMotion } from "motion/react";`),
    ).toEqual([]);
    expect(cssNeedsReducedMotion(`.a { transition: opacity 200ms; }`)).toBe(true);
    expect(cssNeedsReducedMotion(`@keyframes spin { to { rotate: 1turn } }`)).toBe(true);
    expect(
      cssNeedsReducedMotion(
        `.a { transition: opacity 200ms } @media (prefers-reduced-motion: reduce) { .a { transition: none } }`,
      ),
    ).toBe(false);
    expect(cssNeedsReducedMotion(`.a { color: var(--av-fg); }`)).toBe(false);
  });

  it("every animating class string in @autoverse/ui has a reduced-motion counterpart", () => {
    const violations = walk(UI_SRC)
      .filter(isSource)
      .flatMap((f) => {
        const src = readFileSync(f, "utf8");
        return [...findMotionViolations(src), ...findMotionLibraryViolations(src)].map(
          (v) => `${relative(UI_SRC, f)}: ${v}`,
        );
      });
    expect(violations).toEqual([]);
  });

  it("every stylesheet that animates handles prefers-reduced-motion", () => {
    const sheets = [...walk(UI_SRC), ...walk(TOKENS_SRC)].filter((f) => f.endsWith(".css"));
    const violations = sheets
      .filter((f) => cssNeedsReducedMotion(readFileSync(f, "utf8")))
      .map((f) => relative(join(UI_SRC, ".."), f));
    expect(violations).toEqual([]);
  });
});

// ---------- a11y coverage ----------

describe("gate: every primitive is axe-tested", () => {
  it("each component folder has a co-located test that asserts toHaveNoViolations", () => {
    const missing = readdirSync(COMPONENTS)
      .filter((name) => statSync(join(COMPONENTS, name)).isDirectory())
      .filter((name) => {
        const tests = readdirSync(join(COMPONENTS, name)).filter((f) => f.endsWith(".test.tsx"));
        return !tests.some((t) =>
          readFileSync(join(COMPONENTS, name, t), "utf8").includes("toHaveNoViolations"),
        );
      });
    expect(missing).toEqual([]);
  });
});
