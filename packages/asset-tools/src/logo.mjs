// @ts-check
// Brand logos (ADR 0024), as code: pure checks + naming + SQL, unit tested in logo.test.mjs.
//
// A logo is a public-bucket object {brand}/_brand/logo-{light|dark}.{hash8}.{svg|png}:
// - content-hashed, never reused (ADR 0022);
// - SVG or PNG only;
// - rendered by the page with <img>, never inline. An SVG opened directly at its bucket URL WOULD run
//   script, though, so SVGs carrying script, event handlers, external references or embedded HTML are
//   refused here.

import { createHash } from "node:crypto";
import sharp from "sharp";
import { isSlug } from "./lib.mjs";

/** @typedef {"light" | "dark"} LogoVariant */

export const LOGO_VARIANTS = /** @type {const} */ (["light", "dark"]);

/**
 * What in an SVG is refused, with the reason shown to the owner.
 * @type {Array<[RegExp, string]>}
 */
const SVG_REFUSED = [
  [/<script\b/i, "a <script> element"],
  [/\son[a-z]+\s*=/i, "an event-handler attribute (on…=)"],
  [/javascript:/i, "a javascript: URL"],
  [/<foreignObject\b/i, "embedded HTML (<foreignObject>)"],
  [
    /(?:xlink:)?href\s*=\s*["']\s*(?!#)/i,
    "a reference to another file or URL (href not starting with #)",
  ],
  [/<!ENTITY|<!DOCTYPE/i, "an XML entity or DOCTYPE declaration"],
  [
    /<(?:animate|animateMotion|animateTransform|set)\b/i,
    "an animation element (can rewrite links)",
  ],
  [/&#/, "a character reference (can hide a URL or script)"],
  [/@import|url\(\s*["']?\s*(?!#)/i, "a CSS reference to another file or URL"],
];

/**
 * Check a logo file and return its extension. Throws with a readable reason.
 * @param {string} fileName
 * @param {Buffer} data
 * @returns {Promise<"svg" | "png">}
 */
export async function checkLogo(fileName, data) {
  const ext = fileName.toLowerCase().split(".").pop();
  if (ext === "svg") {
    const text = data.toString("utf8");
    if (!/<svg\b/i.test(text)) throw new Error(`${fileName}: not an SVG document`);
    for (const [pattern, what] of SVG_REFUSED) {
      if (pattern.test(text)) {
        throw new Error(
          `${fileName}: the SVG contains ${what}; export a plain SVG (shapes and paths only)`,
        );
      }
    }
    return "svg";
  }
  if (ext === "png") {
    const meta = await sharp(data)
      .metadata()
      .catch(() => null);
    if (!meta || meta.format !== "png") throw new Error(`${fileName}: not a valid PNG`);
    if (!meta.hasAlpha) {
      throw new Error(
        `${fileName}: the PNG has no transparency; a logo needs a transparent background`,
      );
    }
    return "png";
  }
  throw new Error(`${fileName}: a logo must be .svg or .png (got .${ext})`);
}

/**
 * The surface each variant is FOR (logos are named by the surface they go on; owner decision B):
 * `light` → the light canvas (Mist), `dark` → the dark surface (Gunmetal, the TopBar). The same
 * values as the design tokens (a test keeps them equal; this file runs in plain Node).
 */
export const SURFACE = { light: "#F4F7F5", dark: "#222823" };

/** WCAG 2.2 §1.4.11: a graphic needs 3:1 against what it sits on. */
export const MIN_GRAPHIC_CONTRAST = 3;

/** @param {string} hex */
function luminanceOfHex(hex) {
  const n = parseInt(hex.slice(1), 16);
  return luminance([(n >> 16) & 255, (n >> 8) & 255, n & 255]);
}

/** @param {[number, number, number]} rgb 0–255 */
function luminance(rgb) {
  const [r, g, b] = rgb.map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return (
    0.2126 * /** @type {number} */ (r) +
    0.7152 * /** @type {number} */ (g) +
    0.0722 * /** @type {number} */ (b)
  );
}

/**
 * How well a logo's ink stands out on the surface its variant is for: the contrast ratio of its
 * alpha-weighted average colour (the visible pixels only) against that surface. A mostly-white mark
 * registered as `light` (for light surfaces) scores near 1. The tool warns below 3:1.
 * @param {Buffer} data  SVG or PNG
 * @param {LogoVariant} variant
 */
export async function logoSurfaceContrast(data, variant) {
  const { data: px, info } = await sharp(data, { density: 144 })
    .resize({ width: 256, withoutEnlargement: false })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let r = 0;
  let g = 0;
  let b = 0;
  let weight = 0;
  for (let i = 0; i < px.length; i += info.channels) {
    const a = /** @type {number} */ (px[i + info.channels - 1]) / 255;
    if (a <= 16 / 255) continue;
    r += /** @type {number} */ (px[i]) * a;
    g += /** @type {number} */ (px[i + 1]) * a;
    b += /** @type {number} */ (px[i + 2]) * a;
    weight += a;
  }
  if (weight === 0) throw new Error("the logo has no visible pixels");
  const ink = luminance([r / weight, g / weight, b / weight]);
  const surface = luminanceOfHex(SURFACE[variant]);
  const ratio = (Math.max(ink, surface) + 0.05) / (Math.min(ink, surface) + 0.05);
  return Math.round(ratio * 100) / 100;
}

/**
 * The content-hashed object key: {brand}/_brand/logo-{variant}.{hash8}.{ext}.
 * @param {string} brand
 * @param {LogoVariant} variant
 * @param {Buffer} data
 * @param {"svg" | "png"} ext
 */
export function logoObjectName(brand, variant, data, ext) {
  if (!isSlug(brand)) throw new Error(`bad brand slug "${brand}"`);
  if (!LOGO_VARIANTS.includes(variant))
    throw new Error(`variant must be light or dark (got "${variant}")`);
  const hash8 = createHash("sha256").update(data).digest("hex").slice(0, 8);
  return `${brand}/_brand/logo-${variant}.${hash8}.${ext}`;
}

/** @param {string} s */
const sqlLiteral = (s) => `'${s.replace(/'/g, "''")}'`;

/**
 * Re-runnable SQL that sets the logo on every market theme of the brand, and shows the result.
 * @param {string} brand
 * @param {Array<{ variant: LogoVariant, key: string }>} logos
 */
export function logoSql(brand, logos) {
  if (!isSlug(brand)) throw new Error(`bad brand slug "${brand}"`);
  const sets = logos
    .map(({ variant, key }) => `logo_${variant}_asset_ref = ${sqlLiteral(key)}`)
    .join(", ");
  return [
    "-- Generated by @autoverse/asset-tools logo.mjs (ADR 0024). Safe to re-run.",
    "-- Run in the Supabase SQL editor AFTER uploading the file(s) to the showroom-public bucket.",
    "begin;",
    `update public.brand_themes set ${sets}`,
    ` where brand_id = (select id from public.brands where slug = ${sqlLiteral(brand)});`,
    "commit;",
    "",
    "-- Check: one row per market of the brand, with the new key(s).",
    "select b.slug, t.market_code, t.logo_light_asset_ref, t.logo_dark_asset_ref",
    "  from public.brand_themes t join public.brands b on b.id = t.brand_id",
    ` where b.slug = ${sqlLiteral(brand)} order by 2;`,
    "",
  ].join("\n");
}
