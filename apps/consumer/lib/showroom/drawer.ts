import { resolveLedgerRow } from "@autoverse/engine-core";
import type { Copy, Lang } from "./copy";
import { formatPrice, type Showroom, type ShowroomModel, type ShowroomTrim } from "./loader";

// The spec drawer's content for ONE trim (spec §5.8), pure so every rule is unit tested:
//
// - Tabs → groups → rows from the model's spec ledger, in order.
// - A row shows the value resolveLedgerRow gives this trim: the shared value of an all-trims row,
//   or this trim's own entry. A per-trim row with nothing for this trim is left out (a spec that
//   doesn't apply), never shown empty.
// - A group with no rows for this trim shows its note, or the "data will be added" note.
// - A model with no ledger at all shows that note alone.
// - All text in the page's language; nothing brand-specific but the brand's name, from data.

export interface DrawerRow {
  k: string;
  v: string;
}

export interface DrawerGroup {
  label: string;
  note: string | null;
  rows: DrawerRow[];
}

export interface DrawerTab {
  key: string;
  label: string;
  groups: DrawerGroup[];
}

export interface DrawerContent {
  /** e.g. "2026 · Demo Motors". */
  eyebrow: string;
  modelName: string;
  trimName: string;
  /** e.g. "From EGP 3,900,000", or "Price on request". */
  price: string;
  tabs: DrawerTab[];
  /** Shown instead of tabs when the model has no ledger yet. */
  pending: string;
}

export function drawerContent(
  model: ShowroomModel,
  trim: ShowroomTrim,
  lang: Lang,
  market: Showroom["market"],
  brandName: string,
  t: Copy,
): DrawerContent {
  const pending = t.specPending(brandName);
  const tabs: DrawerTab[] = model.spec.map((tab) => ({
    key: tab.key,
    label: tab.title[lang],
    groups: tab.groups.map((group) => {
      const rows: DrawerRow[] = [];
      for (const row of group.rows) {
        const value = resolveLedgerRow(row.ledger, trim.id);
        if (value) rows.push({ k: row.key[lang], v: value[lang] });
      }
      const note = group.note ? group.note[lang] : rows.length === 0 ? pending : null;
      return { label: group.title[lang], note, rows };
    }),
  }));
  return {
    eyebrow: [model.year === null ? null : String(model.year), brandName]
      .filter((v): v is string => v !== null)
      .join(" · "),
    modelName: model.name[lang],
    trimName: trim.name[lang],
    price:
      trim.price.kind === "amount"
        ? `${t.from} ${formatPrice(trim.price, lang, market, t.priceOnRequest)}`
        : t.priceOnRequest,
    tabs,
    pending,
  };
}
