#!/usr/bin/env node
// @ts-check
// Prepare brand logos for upload (ADR 0024), locally.
//
//   node packages/asset-tools/src/logo-cli.mjs --brand <slug> --out <empty dir>
//        [--light <file.svg|png>] [--dark <file.svg|png>]
//
// For each given file: checks it (SVG/PNG only, no script or external references in an SVG, a PNG
// with transparency), writes <out>/<brand>/_brand/logo-<variant>.<hash8>.<ext>, and writes
// <out>/register-logo.sql. Upload the <brand> folder into the showroom-public bucket, then run the SQL.
// Exit code 1 on any error; the SQL is written only when there are none.

import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { parseArgs } from "node:util";
import { isSlug } from "./lib.mjs";
import { checkLogo, logoObjectName, logoSql } from "./logo.mjs";

const { values } = parseArgs({
  options: {
    brand: { type: "string" },
    out: { type: "string" },
    light: { type: "string" },
    dark: { type: "string" },
  },
});
const { brand, out } = values;
if (!brand || !out || (!values.light && !values.dark)) {
  console.error(
    "usage: logo-cli.mjs --brand <slug> --out <empty dir> [--light <file>] [--dark <file>]",
  );
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
    const key = logoObjectName(brand, variant, data, ext);
    const target = join(out, key);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, data);
    logos.push({ variant, key });
    console.log(`OK   ${variant}: ${file}  →  ${key}`);
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
