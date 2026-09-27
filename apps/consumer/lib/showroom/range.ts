import type { Lang } from "./copy";
import type { Showroom, ShowroomModel } from "./loader";

// Filter, search and sort for the range (spec §5.5). Pure, so every rule is unit tested; the client
// component only holds the state and calls these.
//
// - Filtering hides WHOLE model sections: a model is shown or not, never half its trims.
// - Within a group the options are OR (SUV or Hatchback); across groups they are AND (SUV and EV).
// - Drive and seats can differ per trim: a model matches when ANY of its trims has the value. That
//   is the same rule the facet counts use (a model counts once per value).
// - Search matches the model name, in either language, case-insensitively, with Arabic spelling
//   variants folded (foldForSearch).
// - Sort: featured = the line-up order (order_index); name = A–Z in the page's language; power = the
//   model's most powerful trim, high to low; 0–100 = its quickest trim, quickest first. A model
//   without the figure goes last. Ties keep the line-up order.
// - Facet counts are over the whole range (as the approved page), not the current result.

export const FACET_KEYS = ["body", "fuel", "drive", "seats"] as const;
export type FacetKey = (typeof FACET_KEYS)[number];

export const SORT_KEYS = ["featured", "name", "power", "accel"] as const;
export type SortKey = (typeof SORT_KEYS)[number];

export type Selection = Record<FacetKey, readonly string[]>;

export const NO_SELECTION: Selection = { body: [], fuel: [], drive: [], seats: [] };

/** What filtering and sorting need about one model: serialisable, so it crosses to the client. */
export interface ModelFacts {
  id: string;
  names: { en: string; ar: string };
  body: string | null;
  fuel: string | null;
  drives: string[];
  seats: string[];
  /** The most powerful trim's hp, or null. */
  powerHp: number | null;
  /** The quickest trim's 0–100 in seconds, or null. */
  accelS: number | null;
}

const distinct = <T>(values: (T | null)[]): T[] => [
  ...new Set(values.filter((v): v is T => v !== null)),
];

export function modelFacts(model: ShowroomModel): ModelFacts {
  const powers = distinct(model.trims.map((t) => t.stats.powerHp));
  const accels = distinct(model.trims.map((t) => t.stats.accelS));
  return {
    id: model.id,
    names: model.name,
    body: model.body?.key ?? null,
    // The same key the fuel facet groups by (the fuel category, loader.ts).
    fuel: model.fuelCategory?.key ?? null,
    drives: distinct(model.trims.map((t) => t.stats.drive?.key ?? null)),
    seats: distinct(
      model.trims.map((t) => (t.stats.seats === null ? null : String(t.stats.seats))),
    ),
    powerHp: powers.length ? Math.max(...powers) : null,
    accelS: accels.length ? Math.min(...accels) : null,
  };
}

export function isSortKey(value: string): value is SortKey {
  return (SORT_KEYS as readonly string[]).includes(value);
}

export function activeCount(selection: Selection): number {
  return FACET_KEYS.reduce((n, k) => n + selection[k].length, 0);
}

export function toggle(selection: Selection, key: FacetKey, value: string): Selection {
  const current = selection[key];
  return {
    ...selection,
    [key]: current.includes(value) ? current.filter((v) => v !== value) : [...current, value],
  };
}

export function isFacetKey(value: string): value is FacetKey {
  return (FACET_KEYS as readonly string[]).includes(value);
}

/**
 * Search folding, applied to the query and the names alike: NFKC, lower case, and the Arabic
 * spellings people type interchangeably: diacritics (tashkeel) and tatweel dropped, أ إ آ ٱ → ا,
 * ى → ي, ة → ه. So "الفا" finds "ألفا".
 */
export function foldForSearch(s: string): string {
  return s
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[ً-ٰٟـ]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .trim();
}

function matches(m: ModelFacts, selection: Selection, query: string): boolean {
  const q = foldForSearch(query);
  if (q && !foldForSearch(m.names.en).includes(q) && !foldForSearch(m.names.ar).includes(q)) {
    return false;
  }
  const any = (picked: readonly string[], values: readonly string[]) =>
    picked.length === 0 || values.some((v) => picked.includes(v));
  return (
    any(selection.body, m.body === null ? [] : [m.body]) &&
    any(selection.fuel, m.fuel === null ? [] : [m.fuel]) &&
    any(selection.drive, m.drives) &&
    any(selection.seats, m.seats)
  );
}

/** Nulls last; otherwise by `by`. */
function byFigure(get: (m: ModelFacts) => number | null, direction: 1 | -1) {
  return (a: ModelFacts, b: ModelFacts) => {
    const x = get(a);
    const y = get(b);
    if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1;
    return (x - y) * direction;
  };
}

/**
 * The ids of the models to show, in display order. `models` must be in line-up order (the loader's),
 * which is "featured" and the tie-break for every other sort (Array.prototype.sort is stable).
 */
export function visibleModelIds(
  models: readonly ModelFacts[],
  selection: Selection,
  query: string,
  sort: SortKey,
  lang: Lang,
  locale: string,
): string[] {
  const list = models.filter((m) => matches(m, selection, query));
  const collator = new Intl.Collator(lang === "ar" ? locale : "en", { sensitivity: "base" });
  const compare: Record<SortKey, ((a: ModelFacts, b: ModelFacts) => number) | null> = {
    featured: null,
    name: (a, b) => collator.compare(a.names[lang], b.names[lang]),
    power: byFigure((m) => m.powerHp, -1),
    accel: byFigure((m) => m.accelS, 1),
  };
  const cmp = compare[sort];
  return (cmp ? [...list].sort(cmp) : list).map((m) => m.id);
}

/** The facet groups, from the loader's facets (counts over the whole range). */
export function facetGroups(facets: Showroom["facets"]) {
  return FACET_KEYS.map((key) => ({ key, options: facets[key] })).filter(
    (g) => g.options.length > 0,
  );
}
