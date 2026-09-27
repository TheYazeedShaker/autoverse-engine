#!/usr/bin/env node
// @ts-check
// Download the current masters from the public bucket, bypassing caches, into a local folder laid out
// the way normalize.mjs reads it.
//
//   node packages/asset-tools/src/download.mjs --base <ASSET_BASE_URL> --keys <keys.txt> --out <dir>
//
// <keys.txt>: one object key per line, e.g. `demo/lyriq/signature-luxury-side.png` (the `public_path`
// values from the registry; the runbook has the query). Files land in <out>/<key>.
// Each request adds a unique query string and asks for no cache, because the storage CDN caches objects
// for an hour: without that, a file replaced under the same name can come back as the OLD copy.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: { base: { type: "string" }, keys: { type: "string" }, out: { type: "string" } },
});
if (!values.base || !values.keys || !values.out) {
  console.error("usage: download.mjs --base <ASSET_BASE_URL> --keys <keys.txt> --out <dir>");
  process.exit(2);
}

const base = new URL(values.base.endsWith("/") ? values.base : `${values.base}/`);
if (base.protocol !== "https:" || base.pathname === "/") {
  console.error("--base must be the https public prefix of one bucket (ASSET_BASE_URL)");
  process.exit(2);
}
/** A master is a single still image; anything bigger is not one. */
const MAX_BYTES = 25 * 1024 * 1024;
const KEY = /^[a-z0-9-]+\/[a-z0-9-]+\/[a-z0-9-]+-(side|front-34)(\.[0-9a-f]{8})?\.(png|webp)$/;
const keys = (await readFile(values.keys, "utf8"))
  .split(/\r?\n/)
  .map((l) => l.trim())
  .filter(Boolean);

let failed = 0;
for (const key of keys) {
  if (!KEY.test(key)) {
    console.error(`SKIP ${key}: not a {brand}/{model}/{trim}-{view}[.hash8].{png|webp} key`);
    failed++;
    continue;
  }
  const url = new URL(key, base);
  url.searchParams.set("nocache", `${Date.now()}`);
  // No redirects: the https, one-bucket check on --base must hold for every byte fetched.
  let res;
  try {
    res = await fetch(url, {
      cache: "no-store",
      redirect: "error",
      // Every external call has a timeout (CLAUDE.md).
      signal: AbortSignal.timeout(30_000),
      headers: { "cache-control": "no-cache" },
    });
  } catch (e) {
    const err = /** @type {Error & { cause?: { message?: string } }} */ (e);
    console.error(`FAIL ${key}: ${err.cause?.message ?? err.message}`);
    failed++;
    continue;
  }
  const type = res.headers.get("content-type") ?? "";
  const size = Number(res.headers.get("content-length") ?? "0");
  if (!res.ok || !type.startsWith("image/")) {
    console.error(`FAIL ${key}: HTTP ${res.status} ${type}`);
    failed++;
    continue;
  }
  if (size > MAX_BYTES) {
    console.error(`FAIL ${key}: ${size} bytes is over the ${MAX_BYTES}-byte limit for a master`);
    failed++;
    continue;
  }
  const target = join(values.out, key);
  await mkdir(dirname(target), { recursive: true });
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length > MAX_BYTES) {
    console.error(`FAIL ${key}: over the ${MAX_BYTES}-byte limit`);
    failed++;
    continue;
  }
  await writeFile(target, bytes);
  console.log(`OK   ${key}`);
}
console.log(`\n${keys.length - failed} of ${keys.length} downloaded into ${values.out}`);
process.exit(failed ? 1 : 0);
