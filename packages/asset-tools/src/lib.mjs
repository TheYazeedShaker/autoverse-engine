// @ts-check
// Showroom asset standard (ADR 0022), as code. Pure functions + sharp, unit tested in lib.test.mjs.
//
// - One master per trim per view: `side` (cards, drawer) and `front-34` (hero).
// - Canonical direction: every side master faces RIGHT (the front of the car at the right edge).
// - Masters have a transparent background, are trimmed tight to the car and scaled to one standard
//   width per view.
// - Object names are content-hashed: {brand}/{model}/{trim}-{view}.{hash8}.{ext}, so a new version is
//   a new URL and no cache can ever serve an old copy.
// - No stored variants: sizes, crops and mirroring happen at render time.

import { createHash } from "node:crypto";
import sharp from "sharp";

/** @typedef {"side" | "front-34"} View */
/** @typedef {{ model: string, trim: string, view: View, ext: string }} Master */

export const VIEWS = /** @type {const} */ (["side", "front-34"]);
/** Standard master width per view, in pixels (the largest srcset width, spec §5.3). */
export const STANDARD_WIDTH = { side: 1920, "front-34": 1920 };
/**
 * Alpha at or below this counts as background when finding the car's bounding box, so a faint baked-in
 * shadow or antialiasing haze can't make one car's box bigger than another's.
 */
export const ALPHA_THRESHOLD = 16;

const SLUG = "[a-z0-9]+(?:-[a-z0-9]+)*";
const SLUG_RE = new RegExp(`^${SLUG}$`);
const FILE = new RegExp(`^(${SLUG})-(side|front-34)(?:\\.([0-9a-f]{8}))?\\.(png|webp)$`);

/** @param {string} s */
export function isSlug(s) {
  return SLUG_RE.test(s);
}

/**
 * Parse a master's path relative to the input folder: `<model>/<trim>-<view>[.<hash8>].<ext>`.
 * Throws with a readable reason for anything else, so a stray file never gets registered.
 * @param {string} relativePath
 * @returns {Master}
 */
export function parseMasterPath(relativePath) {
  const parts = relativePath.split(/[\\/]/).filter(Boolean);
  if (parts.length !== 2) {
    throw new Error(`${relativePath}: expected <model>/<trim>-<view>.<ext>`);
  }
  const [model, file] = /** @type {[string, string]} */ (parts);
  if (!isSlug(model)) throw new Error(`${relativePath}: bad model slug "${model}"`);
  const m = FILE.exec(file);
  if (!m) throw new Error(`${relativePath}: file must be <trim>-<side|front-34>[.<hash8>].<png|webp>`);
  return { model, trim: /** @type {string} */ (m[1]), view: /** @type {View} */ (m[2]), ext: /** @type {string} */ (m[4]) };
}

/**
 * The content-hashed object name: {brand}/{model}/{trim}-{view}.{hash8}.{ext}.
 * @param {string} brand
 * @param {Pick<Master, "model" | "trim" | "view">} master
 * @param {Buffer} data
 */
export function objectName(brand, { model, trim, view }, data, ext = "png") {
  if (!isSlug(brand)) throw new Error(`bad brand slug "${brand}"`);
  const hash8 = createHash("sha256").update(data).digest("hex").slice(0, 8);
  return `${brand}/${model}/${trim}-${view}.${hash8}.${ext}`;
}

/**
 * The master must have a transparent background: an alpha channel, and transparent corners.
 * An opaque master would put its background colour inside every frame.
 * @param {Buffer} input
 */
export async function assertTransparentBackground(input) {
  const meta = await sharp(input).metadata();
  if (!meta.hasAlpha) throw new Error("no alpha channel: masters need a transparent background");
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const alphaAt = (/** @type {number} */ x, /** @type {number} */ y) =>
    /** @type {number} */ (data[(y * width + x) * channels + channels - 1]);
  const corners = [alphaAt(0, 0), alphaAt(width - 1, 0), alphaAt(0, height - 1), alphaAt(width - 1, height - 1)];
  if (corners.some((a) => a > ALPHA_THRESHOLD)) {
    throw new Error("the corners are not transparent: masters need a transparent background");
  }
}

/**
 * The car's bounding box: the smallest rectangle holding every pixel with alpha above the threshold.
 * @param {Buffer} input
 */
export async function carBoundingBox(input) {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (/** @type {number} */ (data[(y * width + x) * channels + channels - 1]) > ALPHA_THRESHOLD) {
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
  }
  if (right < 0) throw new Error("the image is empty (no opaque pixels)");
  return { left, top, width: right - left + 1, height: bottom - top + 1 };
}

/** @param {Buffer} input */
async function tight(input) {
  const box = await carBoundingBox(input);
  return { box, buffer: await sharp(input).ensureAlpha().extract(box).png().toBuffer() };
}

/**
 * Which way a SIDE view faces, from the roofline of the tight-trimmed car.
 * For each column, the car's height is measured from its top-most opaque pixel down to the bottom
 * edge. On a side view the bonnet end sits lower than the tail end (the tailgate, or the boot plus
 * rear screen), so the end with the lower average height over its outer quarter is the FRONT.
 * It is a heuristic: a pickup (tall bonnet, low bed) or a long-tailed coupé can read the wrong way.
 * So only a strong result is a verdict: "right", "left" (strong), "left-weak" (probably left),
 * "uncertain". The two heights are returned so the report can show them.
 * @param {Buffer} input
 * @param {{ margin?: number, strong?: number }} [opts]
 */
export async function sideDirection(input, { margin = 0.06, strong = 0.15 } = {}) {
  const { buffer } = await tight(input);
  const { data, info } = await sharp(buffer).resize({ width: 400 }).raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const heights = new Array(width).fill(0);
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      if (/** @type {number} */ (data[(y * width + x) * channels + channels - 1]) > ALPHA_THRESHOLD * 8) {
        heights[x] = height - y;
        break;
      }
    }
  }
  const quarter = Math.max(1, Math.floor(width / 4));
  /** @param {number[]} slice */
  const mean = (slice) => {
    const s = slice.filter((h) => h > 0);
    return s.reduce((a, b) => a + b, 0) / Math.max(1, s.length);
  };
  const left = mean(heights.slice(0, quarter));
  const right = mean(heights.slice(width - quarter));
  const diff = (left - right) / Math.max(left, right, 1);
  /** @type {"right" | "left" | "left-weak" | "uncertain"} */
  const direction =
    diff > margin ? "right" : diff < -strong ? "left" : diff < -margin ? "left-weak" : "uncertain";
  return { direction, left: Math.round(left), right: Math.round(right) };
}

/**
 * Trim to the car's bounding box (alpha above ALPHA_THRESHOLD), then scale to the view's standard width.
 * Returns the PNG bytes, the final size, and whether the master had to be enlarged (a low-resolution
 * source: worth replacing).
 * @param {Buffer} input
 * @param {View} view
 */
export async function normaliseMaster(input, view) {
  const { box, buffer } = await tight(input);
  const { data, info } = await sharp(buffer)
    .resize({ width: STANDARD_WIDTH[view] })
    .png({ compressionLevel: 9 })
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height, upscaled: box.width < STANDARD_WIDTH[view] };
}

/** @param {string | number} s */
const sqlLiteral = (s) => `'${String(s).replace(/'/g, "''")}'`;

/**
 * Re-runnable SQL that registers each normalised master: one row per (trim, view), updated in place
 * (new public_path and size; an existing storage_path is left as it is) or inserted if missing.
 * Aborts on an unknown brand/model/trim.
 * @param {string} brand
 * @param {Array<Pick<Master, "model" | "trim" | "view"> & { publicPath: string, width: number, height: number }>} items
 */
export function registrationSql(brand, items) {
  if (!isSlug(brand)) throw new Error(`bad brand slug "${brand}"`);
  const lines = [
    "-- Generated by @autoverse/asset-tools normalize.mjs (ADR 0022). Safe to re-run.",
    "-- Registers one master per (trim, view) with its content-hashed public_path. Run in the Supabase",
    "-- SQL editor AFTER uploading the files to the showroom-public bucket.",
    "begin;",
    "do $$",
    "declare b uuid; m uuid; t uuid; n int;",
    "begin",
    `  select id into b from public.brands where slug = ${sqlLiteral(brand)};`,
    `  if b is null then raise exception 'brand % not found', ${sqlLiteral(brand)}; end if;`,
  ];
  for (const it of items) {
    const label = `${it.model}/${it.trim}`;
    lines.push(
      "",
      `  -- ${label} · ${it.view}`,
      "  select mo.id, tr.id into m, t from public.trims tr join public.models mo on mo.id = tr.model_id",
      `   where mo.brand_id = b and mo.slug = ${sqlLiteral(it.model)} and tr.slug = ${sqlLiteral(it.trim)};`,
      `  if t is null then raise exception 'trim % not found', ${sqlLiteral(label)}; end if;`,
      `  update public.assets set kind = 'render', public_path = ${sqlLiteral(it.publicPath)},`,
      `      width = ${Number(it.width)}, height = ${Number(it.height)}`,
      `   where brand_id = b and trim_id = t and view_key = ${sqlLiteral(it.view)} and kind in ('render', 'image');`,
      "  get diagnostics n = row_count;",
      "  if n = 0 then",
      "    -- storage_path is required. There is no private-store copy for hand-registered masters (1·B",
      "    -- creates those), so it records the master's name under a masters/ prefix (ADR 0022).",
      "    insert into public.assets (brand_id, kind, storage_path, public_path, model_id, trim_id, view_key, width, height)",
      `    values (b, 'render', ${sqlLiteral(`masters/${it.publicPath}`)}, ${sqlLiteral(it.publicPath)}, m, t, ${sqlLiteral(it.view)}, ${Number(it.width)}, ${Number(it.height)});`,
      "  end if;",
    );
  }
  lines.push(
    "end $$;",
    "commit;",
    "",
    "-- Check: the registered masters for this brand (expect one row per trim per view).",
    "select mo.slug as model, tr.slug as trim, a.view_key, a.public_path, a.width, a.height",
    "  from public.assets a join public.trims tr on tr.id = a.trim_id join public.models mo on mo.id = tr.model_id",
    `  join public.brands br on br.id = a.brand_id where br.slug = ${sqlLiteral(brand)} and a.kind in ('render', 'image')`,
    " order by 1, 2, 3;",
    "",
  );
  return lines.join("\n");
}
