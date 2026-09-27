import { useState } from "react";
import type { FilterGroup, FilterPanelProps, SortOption } from "./FilterPanel";

// Synthetic data for the FilterPanel tests and stories: no real vehicle names.

const opt = (value: string, label: string, n: number, unit = "models") => ({
  value,
  label,
  count: String(n),
  countLabel: `${n} ${n === 1 ? unit.replace(/s$/, "") : unit}`,
});

export const GROUPS_EN: FilterGroup[] = [
  {
    key: "body",
    label: "Body type",
    options: [opt("suv", "SUV", 3), opt("hatch", "Hatchback", 1)],
  },
  { key: "fuel", label: "Fuel", options: [opt("ev", "EV", 3), opt("petrol", "Petrol", 1)] },
  { key: "drive", label: "Drive", options: [opt("awd", "AWD", 4), opt("rwd", "RWD", 1)] },
  {
    key: "seats",
    label: "Seats",
    options: [opt("5", "5", 3), opt("7", "7", 1)],
    defaultOpen: false,
  },
];

export const GROUPS_AR: FilterGroup[] = [
  {
    key: "body",
    label: "نوع الهيكل",
    options: [
      { value: "suv", label: "SUV", count: "٣", countLabel: "٣ طرازات" },
      { value: "hatch", label: "هاتشباك", count: "١", countLabel: "طراز واحد" },
    ],
  },
  {
    key: "fuel",
    label: "الوقود",
    options: [{ value: "ev", label: "كهربائي", count: "٣", countLabel: "٣ طرازات" }],
  },
];

export const SORT_EN: SortOption[] = [
  { value: "featured", label: "Featured" },
  { value: "name", label: "Name A–Z" },
  { value: "power", label: "Power · high to low" },
  { value: "accel", label: "0–100 · quickest first" },
];

export const LABELS_EN: FilterPanelProps["labels"] = {
  title: "Filters",
  clearAll: "Clear all",
  search: "Search models",
  sortBy: "Sort by",
  selectedCount: (n) => `${n} selected`,
};

export const LABELS_AR: FilterPanelProps["labels"] = {
  title: "الفلاتر",
  clearAll: "مسح الكل",
  search: "ابحث عن طراز",
  sortBy: "ترتيب حسب",
  selectedCount: (n) => `${n} محدد`,
};

/** The panel's props wired to local state, as the app does. */
export function useFilterState(initial: Record<string, string[]> = {}) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("featured");
  const [selected, setSelected] = useState<Record<string, string[]>>(initial);
  return {
    search,
    onSearchChange: setSearch,
    sort,
    onSortChange: setSort,
    selected,
    onToggle: (key: string, value: string) =>
      setSelected((s) => {
        const current = s[key] ?? [];
        return {
          ...s,
          [key]: current.includes(value) ? current.filter((v) => v !== value) : [...current, value],
        };
      }),
    onClear: () => {
      setSelected({});
      setSearch("");
    },
  };
}
