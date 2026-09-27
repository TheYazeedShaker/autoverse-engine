#!/usr/bin/env node
// @ts-check
// Normalise a folder of showroom masters to the asset standard (ADR 0022), locally.
//
//   node packages/asset-tools/src/normalize.mjs --in <dir> --out <empty dir> --brand <slug>
//        [--confirm-right <model/file,model/file>]
//
// <in> holds <model>/<trim>-<view>[.<hash8>].<png|webp> (the layout the bucket uses under <brand>/).
// For each master it:
//   1. checks the name, and that each (trim, view) appears once;
//   2. checks the background is transparent (an opaque master is an ERROR);
//   3. for SIDE views, checks the car faces RIGHT (a heuristic):
//      - a strong "left" is an ERROR: fix the master. Nothing is ever flipped at render time except the
//        Arabic/RTL mirror. If you have checked by eye that it does face right (the heuristic can misread
//        a pickup or a long-tailed coupé), list it in --confirm-right;
//      - a weak "left", or too close to call, is a WARNING: check it by eye;
//   4. trims to the car's bounding box and scales to the view's standard width (warns when that means
//      enlarging a small source);
//   5. writes <out>/<brand>/<model>/<trim>-<view>.<hash8>.png (content-hashed);
//   6. writes <out>/register.sql (re-runnable) and <out>/report.txt.
// <out> must be empty or new, so an upload of <out>/<brand> never carries files from an older run.
// Exit code 1 on any error; register.sql is written only when there are none.

import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { parseArgs } from "node:util";
import {
  assertTransparentBackground,
  isSlug,
  normaliseMaster,
  objectName,
  parseMasterPath,
  registrationSql,
  sideDirection,
} from "./lib.mjs";

const { values } = parseArgs({
  options: {
    in: { type: "string" },
    out: { type: "string" },
    brand: { type: "string" },
    "confirm-right": { type: "string" },
  },
});
if (!values.in || !values.out || !values.brand) {
  console.error("usage: normalize.mjs --in <dir> --out <empty dir> --brand <slug> [--confirm-right a/b.png,…]");
  process.exit(2);
}
const inDir = values.in;
const outDir = values.out;
const brand = values.brand;
// Checked up front: the slug goes into file names and into register.sql.
if (!isSlug(brand)) {
  console.error(`--brand must be a lower-case slug, e.g. demo (got "${brand}")`);
  process.exit(2);
}
if (existsSync(outDir) && (await readdir(outDir)).length > 0) {
  console.error(`--out ${outDir} is not empty. Use a new or empty folder, so no file from an older run is uploaded.`);
  process.exit(2);
}
const confirmedRight = new Set(
  (values["confirm-right"] ?? "")
    .split(",")
    .map((s) => s.trim().replace(/\\/g, "/"))
    .filter(Boolean),
);

/** @param {string} dir @returns {Promise<string[]>} */
async function files(dir) {
  /** @type {string[]} */
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await files(p)));
    else if (!entry.name.startsWith(".")) out.push(p);
  }
  return out;
}

/** @type {string[]} */ const report = [];
/** @type {string[]} */ const errors = [];
/** @type {string[]} */ const warnings = [];
/** @type {Parameters<typeof registrationSql>[1]} */ const items = [];
/** @type {Map<string, string>} */ const seen = new Map();

for (const path of (await files(inDir)).sort()) {
  const rel = relative(inDir, path).replace(/\\/g, "/");
  let parsed;
  try {
    parsed = parseMasterPath(rel);
  } catch (e) {
    errors.push(/** @type {Error} */ (e).message);
    continue;
  }
  const key = `${parsed.model}/${parsed.trim}/${parsed.view}`;
  if (seen.has(key)) {
    errors.push(`${rel}: a second master for ${key} (also ${seen.get(key)}); keep exactly one`);
    continue;
  }
  seen.set(key, rel);

  const input = await readFile(path);
  try {
    await assertTransparentBackground(input);
  } catch (e) {
    errors.push(`${rel}: ${/** @type {Error} */ (e).message}`);
    continue;
  }

  if (parsed.view === "side") {
    const { direction, left, right } = await sideDirection(input);
    const detail = `(roofline height: left end ${left}, right end ${right})`;
    if (direction === "left" && !confirmedRight.has(rel)) {
      errors.push(
        `${rel}: the car faces LEFT ${detail}. Every side master must face RIGHT: fix the master. ` +
          `If you have checked by eye that it faces right, pass --confirm-right ${rel}`,
      );
      continue;
    }
    if (direction === "left") warnings.push(`${rel}: read as LEFT ${detail}, confirmed right by eye (--confirm-right).`);
    if (direction === "left-weak") warnings.push(`${rel}: probably faces LEFT ${detail}; check by eye.`);
    if (direction === "uncertain") warnings.push(`${rel}: direction too close to call ${detail}; check by eye that it faces RIGHT.`);
  }

  const { data, width, height, upscaled } = await normaliseMaster(input, parsed.view);
  if (upscaled) warnings.push(`${rel}: the car is narrower than ${width}px in the source and was enlarged; a higher-resolution master would be sharper.`);
  const publicPath = objectName(brand, parsed, data, "png");
  const target = join(outDir, publicPath);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, data);
  items.push({ ...parsed, publicPath, width, height });
  report.push(`OK   ${rel}  →  ${publicPath}  (${width}×${height})`);
}

await mkdir(outDir, { recursive: true });
const summary = [
  `Masters in: ${seen.size}   written: ${items.length}   errors: ${errors.length}   warnings: ${warnings.length}`,
  "",
  ...report,
  ...(warnings.length ? ["", "WARNINGS (check by eye):", ...warnings.map((w) => `WARN ${w}`)] : []),
  ...(errors.length ? ["", "ERRORS (nothing was registered for these):", ...errors.map((e) => `ERR  ${e}`)] : []),
  "",
].join("\n");
await writeFile(join(outDir, "report.txt"), summary);
if (errors.length === 0) {
  await writeFile(join(outDir, "register.sql"), registrationSql(brand, items));
}
console.log(summary);
if (errors.length) {
  console.error("Fix the errors above and re-run into an empty --out. register.sql was NOT written.");
  process.exit(1);
}
console.log(`Wrote ${items.length} files under ${join(outDir, brand)} and ${join(outDir, "register.sql")}.`);
