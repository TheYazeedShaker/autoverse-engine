"use client";

import * as Collapsible from "@radix-ui/react-collapsible";
import { ChevronDown, Minus, Plus, Search } from "lucide-react";
import { useId, useRef } from "react";
import { cn } from "../../cn";
import { Icon } from "../Icon";

// FilterPanel — the showroom's search, sort and facet groups (spec §5.5). One body, two frames: the
// sticky glassy FilterSidebar on desktop and the FilterSheet on mobile both render it.
//
// Fully controlled and data-free: the app passes the groups (derived from the catalogue, with counts),
// the current selection and every string, already localised. Nothing here knows a body type or a fuel.
//
// - Search is a labelled search field.
// - Sort is a native <select> (keyboard, screen reader and mobile pickers for free), skinned with tokens.
// - Each group is a Radix Collapsible (a real button with aria-expanded / aria-controls).
// - Options are toggle buttons (aria-pressed). A selected option is the brand accent: the theming REV
//   routes "active/selected indicators (… filter chips …)" to the accent, with its validated on-accent
//   text.

export interface FilterOption {
  /** Stable value (a vocabulary key). */
  value: string;
  /** Display label, localised. */
  label: string;
  /** Models having this value, formatted for display. */
  count: string;
  /** Screen-reader form of the count, e.g. "3 models". */
  countLabel: string;
}

export interface FilterGroup {
  key: string;
  /** e.g. "Body type". */
  label: string;
  options: FilterOption[];
  defaultOpen?: boolean;
}

export interface SortOption {
  value: string;
  label: string;
}

export interface FilterPanelProps {
  labels: {
    /** Panel heading, e.g. "Filters". */
    title: string;
    clearAll: string;
    /** The search field's placeholder and accessible name, e.g. "Search models". */
    search: string;
    sortBy: string;
    /** "2 selected", for the group toggle's accessible name when options are active. */
    selectedCount: (n: number) => string;
  };
  search: string;
  onSearchChange: (value: string) => void;
  sort: string;
  sortOptions: SortOption[];
  onSortChange: (value: string) => void;
  groups: FilterGroup[];
  /** Selected values per group key. */
  selected: Record<string, readonly string[]>;
  onToggle: (groupKey: string, value: string) => void;
  onClear: () => void;
  /** Sidebar shows the title row and a visible sort label; the sheet is more compact. */
  variant?: "sidebar" | "sheet";
  className?: string;
}

const EYEBROW =
  "text-fg-muted text-xs font-semibold tracking-[0.16em] uppercase rtl:tracking-normal";

export function FilterPanel({
  labels,
  search,
  onSearchChange,
  sort,
  sortOptions,
  onSortChange,
  groups,
  selected,
  onToggle,
  onClear,
  variant = "sidebar",
  className,
}: FilterPanelProps) {
  const sortId = useId();
  const searchRef = useRef<HTMLInputElement>(null);
  const canClear =
    search.trim().length > 0 || Object.values(selected).some((values) => values.length > 0);
  const sheet = variant === "sheet";

  return (
    <div className={cn("text-fg flex flex-col", className)} data-filter-panel={variant}>
      <div className="flex min-h-6 items-center justify-between gap-3">
        <span
          className={cn(
            "text-fg text-xs font-bold tracking-[0.2em] uppercase rtl:tracking-normal",
            sheet && "sr-only",
          )}
        >
          {labels.title}
        </span>
        {canClear ? (
          <button
            type="button"
            // The button unmounts once nothing is active, so focus moves to the search field
            // instead of dropping to <body>.
            onClick={() => {
              onClear();
              searchRef.current?.focus();
            }}
            className="text-fg-muted hover:text-fg focus-visible:ring-focus-ring rounded-sm text-xs underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2"
          >
            {labels.clearAll}
          </button>
        ) : null}
      </div>

      <label
        className={cn(
          "bg-surface-white/60 border-surface-white/70 focus-within:ring-focus-ring mt-3.5 flex items-center gap-2.5 rounded-md border px-3 py-2.5 focus-within:ring-2",
          sheet && "border-fg/10 mt-2",
        )}
      >
        <Icon icon={Search} size="sm" className="text-fg-muted shrink-0" />
        <span className="sr-only">{labels.search}</span>
        <input
          ref={searchRef}
          type="search"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={labels.search}
          className={cn(
            "text-fg placeholder:text-fg-muted min-w-0 flex-1 bg-transparent text-sm outline-none",
            sheet && "text-base",
          )}
        />
      </label>

      <div className="mt-3.5">
        <label htmlFor={sortId} className={cn(EYEBROW, "mb-2 block", sheet && "sr-only")}>
          {labels.sortBy}
        </label>
        <div className="relative">
          <select
            id={sortId}
            value={sort}
            onChange={(e) => onSortChange(e.target.value)}
            className={cn(
              "bg-surface-white text-on-white border-fg/10 focus-visible:ring-focus-ring w-full cursor-pointer appearance-none rounded-md border py-2.5 ps-3 pe-9 text-sm focus-visible:outline-none focus-visible:ring-2",
              sheet && "text-base",
            )}
          >
            {sortOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <Icon
            icon={ChevronDown}
            size="sm"
            className="text-fg-muted pointer-events-none absolute end-3 top-1/2 -translate-y-1/2"
          />
        </div>
      </div>

      {groups.map((group) => (
        <FilterGroupBlock
          key={group.key}
          group={group}
          selected={selected[group.key] ?? []}
          onToggle={(value) => onToggle(group.key, value)}
          selectedCount={labels.selectedCount}
          sheet={sheet}
        />
      ))}
    </div>
  );
}

function FilterGroupBlock({
  group,
  selected,
  onToggle,
  selectedCount,
  sheet,
}: {
  group: FilterGroup;
  selected: readonly string[];
  onToggle: (value: string) => void;
  selectedCount: (n: number) => string;
  sheet: boolean;
}) {
  const active = group.options.filter((o) => selected.includes(o.value)).length;
  return (
    <Collapsible.Root
      defaultOpen={group.defaultOpen ?? true}
      className="border-fg/10 mt-4 border-t pt-3"
      data-filter-group={group.key}
    >
      <Collapsible.Trigger className="group focus-visible:ring-focus-ring flex w-full items-center justify-between gap-3 rounded-sm p-0.5 text-start focus-visible:outline-none focus-visible:ring-2">
        <span className={EYEBROW}>{group.label}</span>
        <span className="text-fg-muted flex items-center gap-1.5 text-xs">
          {active > 0 ? (
            <>
              <span aria-hidden="true">{active} ·</span>
              <span className="sr-only">{selectedCount(active)}</span>
            </>
          ) : null}
          <Icon icon={Plus} size="sm" className="group-data-[state=open]:hidden" />
          <Icon icon={Minus} size="sm" className="hidden group-data-[state=open]:block" />
        </span>
      </Collapsible.Trigger>
      <Collapsible.Content>
        <ul role="list" className={cn("mt-2.5 flex flex-wrap gap-2", sheet && "gap-1.5")}>
          {group.options.map((option) => {
            const on = selected.includes(option.value);
            return (
              <li key={option.value}>
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => onToggle(option.value)}
                  className={cn(
                    "focus-visible:ring-focus-ring flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm transition-colors duration-(--av-dur-modal) ease-(--av-ease-modal) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 motion-reduce:transition-none",
                    on
                      ? "bg-accent text-on-accent border-accent"
                      : "text-fg border-fg/15 hover:border-fg/40 bg-transparent",
                  )}
                >
                  <span>{option.label}</span>
                  {/* Full strength on the accent: on-accent is validated against the accent only
                      at full opacity. Off, the muted ink (AA on the panel). */}
                  <span aria-hidden="true" className={cn("text-xs", !on && "text-fg-muted")}>
                    {option.count}
                  </span>
                  <span className="sr-only">, {option.countLabel}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </Collapsible.Content>
    </Collapsible.Root>
  );
}
