"use client";

import { FilterSheet, FilterSidebar, type FilterGroup, type FilterPanelProps } from "@autoverse/ui";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { COPY, type Lang } from "../lib/showroom/copy";
import type { FacetOption } from "../lib/showroom/loader";
import {
  activeCount,
  isFacetKey,
  isSortKey,
  NO_SELECTION,
  SORT_KEYS,
  toggle,
  visibleModelIds,
  type FacetKey,
  type ModelFacts,
  type Selection,
  type SortKey,
} from "../lib/showroom/range";

// The range with its filters (spec §5.5): the sticky sidebar from `lg`, a "Filters" pill that opens
// the bottom sheet below it, the result count, and the model sections, hidden and ordered per the
// current filters, search and sort.
//
// The sections are rendered on the SERVER (cards, images, prices) and passed in as nodes, so the
// catalogue never travels as client data beyond the small ModelFacts used to filter and sort. The
// initial render (no filters, featured order) is exactly the server's.
//
// Slice 4's dock will read the same visible list; slice 9 adds filter/sort events.

export interface RangeSection {
  facts: ModelFacts;
  node: ReactNode;
}

export interface RangeExplorerProps {
  lang: Lang;
  /** The market's locale, for numbers and name order in Arabic. */
  locale: string;
  /**
   * The digits to use ("arab", "latn", …), resolved ONCE on the server and passed in, so the server
   * and the browser format numbers identically whatever their ICU defaults (no hydration mismatch).
   */
  numberingSystem: string;
  sections: RangeSection[];
  facets: { key: FacetKey; options: FacetOption[] }[];
  /** The eyebrow and title block, rendered by the page. */
  header: ReactNode;
}

const DEFAULT_OPEN: Record<FacetKey, boolean> = {
  body: true,
  fuel: true,
  drive: true,
  seats: false,
};

export function RangeExplorer({
  lang,
  locale,
  numberingSystem,
  sections,
  facets,
  header,
}: RangeExplorerProps) {
  const t = COPY[lang];
  const int = useMemo(
    () => new Intl.NumberFormat(lang === "ar" ? locale : "en", { numberingSystem }),
    [lang, locale, numberingSystem],
  );
  const resultRef = useRef<HTMLParagraphElement>(null);
  const [selection, setSelection] = useState<Selection>(NO_SELECTION);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("featured");

  const visible = useMemo(
    () =>
      visibleModelIds(
        sections.map((s) => s.facts),
        selection,
        search,
        sort,
        lang,
        locale,
      ),
    [sections, selection, search, sort, lang, locale],
  );
  const byId = useMemo(() => new Map(sections.map((s) => [s.facts.id, s.node])), [sections]);

  const groups: FilterGroup[] = facets.map(({ key, options }) => ({
    key,
    label: t.facet[key],
    defaultOpen: DEFAULT_OPEN[key],
    options: options.map((o) => ({
      value: o.value,
      // Seat counts are numbers: shown in the page's digits.
      label: key === "seats" ? int.format(Number(o.value)) : o.label[lang],
      count: int.format(o.count),
      countLabel: t.models(int.format(o.count), o.count),
    })),
  }));

  const clear = () => {
    setSelection(NO_SELECTION);
    setSearch("");
  };

  const shared: Omit<FilterPanelProps, "sortOptions" | "variant"> = {
    labels: {
      title: t.filters,
      clearAll: t.clearAll,
      search: t.searchModels,
      sortBy: t.sortBy,
      selectedCount: (n) => t.selectedCount(int.format(n)),
    },
    search,
    onSearchChange: setSearch,
    sort,
    onSortChange: (v) => {
      if (isSortKey(v)) setSort(v);
    },
    groups,
    selected: selection,
    onToggle: (key, value) => {
      if (isFacetKey(key)) setSelection((s) => toggle(s, key, value));
    },
    onClear: clear,
  };

  const active = activeCount(selection);
  const shown = int.format(visible.length);
  const resultText = t.resultCount(shown, int.format(sections.length), sections.length);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3.5">
        {header}
        <div className="flex items-center gap-3.5">
          <p
            ref={resultRef}
            tabIndex={-1}
            className="text-on-panel-muted text-xs focus:outline-none"
            aria-live="polite"
            data-result-count
          >
            {resultText}
          </p>
          <FilterSheet
            {...shared}
            sortOptions={SORT_KEYS.map((k) => ({ value: k, label: t.sortShort[k] }))}
            triggerLabel={active ? t.filtersActive(int.format(active)) : t.filters}
            doneLabel={t.showResults(shown, visible.length)}
            status={resultText}
            triggerClassName="lg:hidden"
          />
        </div>
      </div>
      <div className="mt-10 flex items-start gap-6 xl:gap-11">
        {/* Always rendered: search and sort still work when the data yields no facet groups. */}
        <FilterSidebar
          {...shared}
          sortOptions={SORT_KEYS.map((k) => ({ value: k, label: t.sort[k] }))}
          className="hidden lg:block"
        />
        <div className="flex min-w-0 flex-1 flex-col gap-12 lg:gap-16">
          {visible.length === 0 ? (
            <div className="border-fg/15 flex flex-col items-start gap-3 rounded-xl border border-dashed p-8">
              <p className="text-on-panel text-base">{t.noMatch}</p>
              <button
                type="button"
                // This button unmounts as the sections return, so focus moves to the result count.
                onClick={() => {
                  clear();
                  resultRef.current?.focus();
                }}
                className="text-on-panel-muted hover:text-on-panel focus-visible:ring-focus-ring rounded-sm text-sm underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2"
              >
                {t.clearAll}
              </button>
            </div>
          ) : (
            visible.map((id) => (
              <div key={id} data-range-model={id}>
                {byId.get(id)}
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
