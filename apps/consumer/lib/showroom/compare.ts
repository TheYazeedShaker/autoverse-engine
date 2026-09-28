import type { Lang } from "./copy";

// Compare (spec §5.9), pure so every rule is unit tested:
// - Up to COMPARE_LIMIT trims (spec: max 3; open decision in #build-decisions: the approved page
//   stops at 2. One constant either way).
// - "Compare N" needs at least COMPARE_MIN.
// - The compare page link carries the picked trims in pick order, and the page language. It exists
//   only while the compare page's own flag is on (until PAGE-CONSUMER-COMPARE ships).

export const COMPARE_LIMIT = 3;
export const COMPARE_MIN = 2;

/** Pick or unpick a trim. A pick past the limit (or a duplicate) changes nothing. */
export function toggleCompare(selected: readonly string[], trimId: string, on: boolean): string[] {
  if (!on) return selected.filter((id) => id !== trimId);
  if (selected.includes(trimId) || selected.length >= COMPARE_LIMIT) return [...selected];
  return [...selected, trimId];
}

/** The compare page's link for these trims, or null when it can't be used (yet). */
export function compareHref(
  base: string | null,
  selected: readonly string[],
  lang: Lang,
): string | null {
  if (!base || selected.length < COMPARE_MIN) return null;
  const params = new URLSearchParams({ trims: selected.join(",") });
  if (lang === "ar") params.set("lang", "ar");
  return `${base}?${params.toString().replace(/%2C/g, ",")}`;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The compare page's `?trims=` param: at most COMPARE_LIMIT distinct ids, uuids only, in order.
 * Whatever a visitor puts in the URL, nothing else gets through (the page then keeps only trims it
 * actually knows, from the published catalogue).
 */
export function parseCompareParam(value: string | string[] | undefined): string[] {
  if (typeof value !== "string") return [];
  const ids: string[] = [];
  for (const raw of value.split(",")) {
    const id = raw.trim().toLowerCase();
    if (UUID.test(id) && !ids.includes(id)) ids.push(id);
    if (ids.length === COMPARE_LIMIT) break;
  }
  return ids;
}
