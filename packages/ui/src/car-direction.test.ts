// Car-direction gate (ADR 0022). Every side master faces RIGHT; the ONLY mirroring allowed anywhere is
// the RTL mirror (`rtl:-scale-x-100`), which turns the car to face the reading direction in Arabic. A
// per-model or per-asset flip, like the one the prototype used for two models, would silently put a car
// the wrong way round, so this fails the build if any other horizontal mirror appears in the showroom's
// code: @autoverse/ui and the consumer app.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..", "..", "..");
const SCANNED = [
  join(ROOT, "packages", "ui", "src"),
  join(ROOT, "apps", "consumer", "app"),
  join(ROOT, "apps", "consumer", "lib"),
];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (name === "node_modules" || name === ".next") return [];
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const isSource = (f: string) => /\.(ts|tsx|css)$/.test(f) && !/\.(test|stories)\.tsx?$/.test(f);

/** The one allowed mirror: Tailwind's RTL variant, alone. */
const ALLOWED = new Set(["rtl:-scale-x-100", "rtl:scale-x-[-1]"]);

/** Every horizontal-mirror construct in a source, other than the RTL rule. */
export function findFlips(source: string): string[] {
  const bad: string[] = [];
  // Tailwind classes: take the WHOLE class token around any `scale-x-` (so arbitrary variants such as
  // `[&_img]:` or `group-[.x]:` are part of it), and flag it when it mirrors: `-scale-x-*` or
  // `scale-x-[-…]`. Only the exact RTL rule is allowed.
  for (const m of source.matchAll(/[^\s"'`]*scale-x-[^\s"'`]*/g)) {
    const token = m[0];
    const mirrors = /(^|:)-scale-x-/.test(token) || /scale-x-\[-/.test(token);
    if (mirrors && !ALLOWED.has(token)) bad.push(token);
  }
  // CSS / inline style transforms.
  for (const m of source.matchAll(
    /scaleX\(\s*-|scale\(\s*-1|rotateY\(\s*-?180|scale3d\(\s*-1|matrix\(\s*-1/g,
  )) {
    bad.push(m[0]);
  }
  return bad;
}

describe("gate: cars face right; only the RTL rule mirrors them", () => {
  it("the detector catches what it should (self-test)", () => {
    expect(findFlips(`className="-scale-x-100"`)).toEqual(["-scale-x-100"]);
    expect(findFlips(`className="md:-scale-x-100"`)).toEqual(["md:-scale-x-100"]);
    expect(findFlips(`className="ltr:-scale-x-100"`)).toEqual(["ltr:-scale-x-100"]);
    expect(findFlips(`className="scale-x-[-1]"`)).toEqual(["scale-x-[-1]"]);
    expect(findFlips(`style={{ transform: "scaleX(-1)" }}`)).toEqual(["scaleX(-"]);
    expect(findFlips(`.car { transform: rotateY(180deg) }`)).toEqual(["rotateY(180"]);
    expect(findFlips(`model.slug === "lyriq" ? "-scale-x-100" : ""`)).toEqual(["-scale-x-100"]);
    expect(findFlips(`className="[&_img]:-scale-x-100"`)).toEqual(["[&_img]:-scale-x-100"]);
    expect(findFlips(`className="group-[.x]:-scale-x-100"`)).toEqual(["group-[.x]:-scale-x-100"]);
    expect(findFlips(`.car { transform: matrix(-1, 0, 0, 1, 0, 0) }`)).toEqual(["matrix(-1"]);
    expect(findFlips(`className="rtl:-scale-x-100 relative"`)).toEqual([]);
    expect(findFlips(`className="scale-x-100"`)).toEqual([]);
  });

  it("no source in @autoverse/ui or the consumer app flips an image outside the RTL rule", () => {
    const violations = SCANNED.flatMap((dir) =>
      walk(dir)
        .filter(isSource)
        .flatMap((f) =>
          findFlips(readFileSync(f, "utf8")).map((v) => `${relative(ROOT, f)}: ${v}`),
        ),
    );
    expect(violations).toEqual([]);
  });
});
