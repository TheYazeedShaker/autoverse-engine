#!/usr/bin/env node
// @ts-check
// Prepare brand logos for upload (ADR 0024), locally.
//
//   node packages/asset-tools/src/logo-cli.mjs --brand <slug> --out <empty dir>
//        [--light <file>] [--dark <file>]
//
// Logos are named by the SURFACE they go on (owner decision B; the theming REV and the admin Theme
// tab name them the same way):
//   --light <file>   the logo FOR LIGHT SURFACES: a dark-coloured mark        → logo_light_asset_ref
//   --dark  <file>   the logo FOR DARK SURFACES: a light/white-coloured mark  → logo_dark_asset_ref
//                    (the showroom TopBar is dark, so it shows this one)
//
// For each file: checks it (SVG/PNG only, no script or external references in an SVG, a PNG with
// transparency), WARNS when its colours barely stand out on its surface (e.g. a white mark given as
// --light), writes <out>/<brand>/_brand/logo-<variant>.<hash8>.<ext>, and writes
// <out>/register-logo.sql. Upload the <brand> folder into the showroom-public bucket, then run the SQL.
// Exit code 1 on any error; the SQL is written only when there are none. A warning doesn't stop it:
// check the logo by eye.

import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { parseArgs } from "node:util";
import { isSlug } from "./lib.mjs";
import {
  checkLogo,
  logoObjectName,
  logoSql,
  logoSurfaceContrast,
  MIN_GRAPHIC_CONTRAST,
} from "./logo.mjs";

const USAGE = `usage: logo-cli.mjs --brand <slug> --out <empty dir> [--light <file>] [--dark <file>]
  --light <file>  the logo FOR LIGHT SURFACES (a dark-coloured mark)
  --dark  <file>  the logo FOR DARK SURFACES (a light/white mark; the dark TopBar uses this one)`;

const { values } = parseArgs({
  options: {
    brand: { type: "string" },
    out: { type: "string" },
    light: { type: "string" },
    dark: { type: "string" },
    help: { type: "boolean", short: "h" },
  },
});
if (values.help) {
  console.log(USAGE);
  process.exit(0);
}
const { brand, out } = values;
if (!brand || !out || (!values.light && !values.dark)) {
  console.error(USAGE);
  process.exit(2);
}
if (!isSlug(brand)) {
  console.error(`--brand must be a lower-case slug, e.g. demo (got "${brand}")`);
  process.exit(2);
}
if (existsSync(out) && (await readdir(out)).length > 0) {
  console.error(`--out ${out} is not empty. Use a new or empty folder.`);
  process.exit(2);
}

const SURFACE_NAME = { light: "LIGHT surfaces", dark: "DARK surfaces" };

/** @type {Array<{ variant: "light" | "dark", key: string }>} */
const logos = [];
/** @type {string[]} */
const errors = [];
for (const variant of /** @type {const} */ (["light", "dark"])) {
  const file = values[variant];
  if (!file) continue;
  try {
    const data = await readFile(file);
    const ext = await checkLogo(basename(file), data);
    const ratio = await logoSurfaceContrast(data, variant);
    if (ratio < MIN_GRAPHIC_CONTRAST) {
      const other = variant === "light" ? "--dark" : "--light";
      console.warn(
        `WARN ${variant}: ${file} barely stands out on ${SURFACE_NAME[variant]} ` +
          `(contrast ${ratio}:1, needs ${MIN_GRAPHIC_CONTRAST}:1). --${variant} is the logo FOR ` +
          `${SURFACE_NAME[variant]}; did you mean ${other}? Check it by eye before uploading.`,
      );
    }
    const key = logoObjectName(brand, variant, data, ext);
    const target = join(out, key);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, data);
    logos.push({ variant, key });
    console.log(
      `OK   ${variant} (for ${SURFACE_NAME[variant]}, contrast ${ratio}:1): ${file}  →  ${key}`,
    );
  } catch (e) {
    errors.push(/** @type {Error} */ (e).message);
  }
}
if (errors.length) {
  for (const e of errors) console.error(`ERR  ${e}`);
  console.error("Fix the errors and re-run into an empty --out. No SQL was written.");
  process.exit(1);
}
await writeFile(join(out, "register-logo.sql"), logoSql(brand, logos));
console.log(`Wrote ${join(out, brand)} and ${join(out, "register-logo.sql")}.`);
