import { resolveTrimStats, type EfficiencyIconKind } from "@autoverse/engine-core";
import type { Logger } from "../log";
import type {
  CatalogAssetRow,
  CatalogModelRow,
  CatalogSnapshot,
  CatalogTrimRow,
} from "./catalog-schema";

// The `showroom_catalog` payload → what the showroom shows (spec §3). Pure apart from the logger,
// so every rule below is unit tested without a database.
//
// Rules:
// - The function returns one live brand-market's published rows only (ADR 0018), so there are no
//   per-row brand, status or publish checks here: they would be checks against fields the payload
//   deliberately doesn't carry. What IS checked is the payload's own structure. A trim, price or
//   asset that points at a model or trim not in the payload is dropped and logged.
// - A missing price is "on request", never 0 (§3). Amounts are in the market's currency (#67).
// - Attribute values are vocabulary keys (#69): facets group by key, labels come from the payload's
//   vocabulary, and no vocabulary lives in code. An unknown key shows as itself and logs.
// - A missing image is null plus a logged warning; the component renders its placeholder (§3).
// - Nothing brand-specific lives here: a second brand renders by data alone.

export type Bilingual = { en: string; ar: string };

export type Price = { kind: "amount"; amount: number; currency: string } | { kind: "on_request" };

/** A vocabulary key with its display names. */
export interface VocabLabel {
  key: string;
  label: Bilingual;
}

export interface ImageRef {
  /** Object key in the public published bucket (ADR 0018). The URL is built in slice 2. */
  publicPath: string;
  width: number | null;
  height: number | null;
}

export interface TrimStats {
  drive: VocabLabel | null;
  seats: number | null;
  accelS: number | null;
  powerHp: number | null;
  topSpeedKph: number | null;
}

export interface ShowroomTrim {
  id: string;
  slug: string;
  name: Bilingual;
  stats: TrimStats;
  price: Price;
  /** Side view, for the card. */
  cardImage: ImageRef | null;
  /** Front three-quarter, for the hero. */
  heroImage: ImageRef | null;
}

export interface ShowroomModel {
  id: string;
  slug: string;
  name: Bilingual;
  year: number | null;
  badge: string | null;
  fuel: VocabLabel | null;
  fuelCategory: VocabLabel | null;
  transmission: VocabLabel | null;
  body: VocabLabel | null;
  efficiency: { label: Bilingual; value: string; icon: EfficiencyIconKind } | null;
  /** The lowest priced trim, or on request when none has a price. */
  fromPrice: Price;
  trims: ShowroomTrim[];
}

export interface FacetOption {
  /** The vocabulary key: stable across languages and spellings. */
  value: string;
  label: Bilingual;
  /** Models having this value. Filtering hides whole model sections (§5.5). */
  count: number;
}

export interface Showroom {
  brand: { slug: string; name: string };
  market: { code: string; currency: string; locale: string; rtl: boolean };
  models: ShowroomModel[];
  facets: { body: FacetOption[]; fuel: FacetOption[]; drive: FacetOption[]; seats: FacetOption[] };
}

export const CARD_VIEW = "side";
export const HERO_VIEW = "front-34";

type VocabKind = CatalogSnapshot["vocabulary"][number]["kind"];

export function buildShowroom(snapshot: CatalogSnapshot, log: Logger): Showroom {
  const { brand, market } = snapshot;
  const vocab = vocabulary(snapshot, log, brand.slug);

  const modelIds = new Set(snapshot.models.map((m) => m.id));
  const trims = snapshot.trims.filter((t) => {
    if (modelIds.has(t.model_id)) return true;
    log("warn", "showroom_payload_orphan", { brand: brand.slug, kind: "trim", trim: t.slug });
    return false;
  });
  const trimIds = new Set(trims.map((t) => t.id));
  const prices = new Map<string, CatalogSnapshot["prices"][number]>();
  for (const p of snapshot.prices) {
    if (trimIds.has(p.trim_id)) prices.set(p.trim_id, p);
    else log("warn", "showroom_payload_orphan", { brand: brand.slug, kind: "price" });
  }
  const assets = snapshot.assets.filter((a) => {
    if (modelIds.has(a.model_id) && (a.trim_id === null || trimIds.has(a.trim_id))) return true;
    log("warn", "showroom_payload_orphan", { brand: brand.slug, kind: "asset", view: a.view_key });
    return false;
  });

  const models: ShowroomModel[] = [];
  const ordered = [...snapshot.models].sort(
    (a, b) => a.order_index - b.order_index || a.slug.localeCompare(b.slug),
  );
  for (const model of ordered) {
    const own = trims
      .filter((t) => t.model_id === model.id)
      .sort((a, b) => a.order_index - b.order_index || a.slug.localeCompare(b.slug));
    if (own.length === 0) {
      // A model section is built from its trim cards; with none there is nothing to show.
      log("warn", "showroom_model_without_trims", { brand: brand.slug, model: model.slug });
      continue;
    }
    const built = own.map((trim) =>
      buildTrim(model, trim, prices.get(trim.id), market.currency, assets, vocab, log, brand.slug),
    );
    models.push({
      id: model.id,
      slug: model.slug,
      name: { en: model.name_en, ar: model.name_ar },
      year: model.year,
      badge: model.badge_label,
      fuel: vocab(model.fuel, "fuel"),
      fuelCategory: vocab(model.fuel_category, "fuel"),
      transmission: vocab(model.transmission, "transmission"),
      body: vocab(model.body_type, "body_type"),
      efficiency: efficiencyOf(model),
      fromPrice: lowestPrice(built.map((t) => t.price)),
      trims: built,
    });
  }

  return {
    brand: { slug: brand.slug, name: brand.name },
    market: {
      code: market.market_code,
      currency: market.currency,
      locale: market.locale,
      rtl: market.rtl,
    },
    models,
    facets: {
      body: facet(models, (m) => [m.body]),
      fuel: facet(models, (m) => [m.fuelCategory]),
      drive: facet(models, (m) => m.trims.map((t) => t.stats.drive)),
      seats: facet(models, (m) =>
        m.trims.map((t) => {
          if (t.stats.seats === null) return null;
          const s = String(t.stats.seats);
          return { key: s, label: { en: s, ar: s } };
        }),
      ),
    },
  };
}

type VocabLookup = (key: string | null, kind: VocabKind) => VocabLabel | null;

function vocabulary(snapshot: CatalogSnapshot, log: Logger, brandSlug: string): VocabLookup {
  const byKey = new Map<string, Bilingual>();
  for (const v of snapshot.vocabulary) {
    byKey.set(`${v.kind}:${v.id}`, { en: v.display_en, ar: v.display_ar });
  }
  const reported = new Set<string>();
  return (key, kind) => {
    if (key === null || key === "") return null;
    const label = byKey.get(`${kind}:${key}`);
    if (label) return { key, label };
    if (!reported.has(`${kind}:${key}`)) {
      reported.add(`${kind}:${key}`);
      log("warn", "showroom_vocabulary_missing", { brand: brandSlug, kind, key });
    }
    return { key, label: { en: key, ar: key } };
  };
}

function buildTrim(
  model: CatalogModelRow,
  trim: CatalogTrimRow,
  priceRow: CatalogSnapshot["prices"][number] | undefined,
  currency: string,
  assets: CatalogAssetRow[],
  vocab: VocabLookup,
  log: Logger,
  brandSlug: string,
): ShowroomTrim {
  const stats = resolveTrimStats(model, trim);
  let price: Price = { kind: "on_request" };
  if (!priceRow) {
    log("warn", "showroom_price_missing", { brand: brandSlug, model: model.slug, trim: trim.slug });
  } else if (!priceRow.on_request && priceRow.price_amount !== null) {
    price = { kind: "amount", amount: priceRow.price_amount, currency };
  }
  const image = (view: "side" | "front-34"): ImageRef | null => {
    const found = pickImage(assets, model.id, trim.id, view);
    if (!found) {
      log("warn", "showroom_asset_missing", {
        brand: brandSlug,
        model: model.slug,
        trim: trim.slug,
        view,
      });
    }
    return found;
  };
  return {
    id: trim.id,
    slug: trim.slug,
    name: { en: trim.name_en, ar: trim.name_ar },
    stats: {
      drive: vocab(stats.drive, "drive"),
      seats: stats.seats,
      accelS: stats.accel_0_100_s,
      powerHp: stats.power_hp,
      topSpeedKph: stats.top_speed_kph,
    },
    price,
    cardImage: image(CARD_VIEW),
    heroImage: image(HERO_VIEW),
  };
}

/** The trim's own image for a view, else the model-level one. Deterministic when several match. */
export function pickImage(
  assets: CatalogAssetRow[],
  modelId: string,
  trimId: string,
  view: "side" | "front-34",
): ImageRef | null {
  const candidates = assets
    .filter((a) => a.model_id === modelId && a.view_key === view)
    .sort((a, b) => a.public_path.localeCompare(b.public_path));
  const hit =
    candidates.find((a) => a.trim_id === trimId) ?? candidates.find((a) => a.trim_id === null);
  return hit ? { publicPath: hit.public_path, width: hit.width, height: hit.height } : null;
}

function efficiencyOf(model: CatalogModelRow): ShowroomModel["efficiency"] {
  // A value always comes with its icon and both labels (models_efficiency_complete), but labels
  // may exist without a value. Show the figure only when all four are present.
  if (
    model.efficiency_value === null ||
    model.efficiency_icon_kind === null ||
    model.efficiency_label_en === null ||
    model.efficiency_label_ar === null
  ) {
    return null;
  }
  return {
    label: { en: model.efficiency_label_en, ar: model.efficiency_label_ar },
    value: model.efficiency_value,
    icon: model.efficiency_icon_kind,
  };
}

export function lowestPrice(prices: Price[]): Price {
  let best: Price = { kind: "on_request" };
  for (const p of prices) {
    if (p.kind === "amount" && (best.kind === "on_request" || p.amount < best.amount)) best = p;
  }
  return best;
}

function facet(
  models: ShowroomModel[],
  values: (m: ShowroomModel) => (VocabLabel | null)[],
): FacetOption[] {
  const counts = new Map<string, FacetOption>();
  for (const m of models) {
    // A model counts once per key, however many of its trims share it.
    const seen = new Set<string>();
    for (const v of values(m)) {
      if (v === null || seen.has(v.key)) continue;
      seen.add(v.key);
      const current = counts.get(v.key);
      if (current) current.count += 1;
      else counts.set(v.key, { value: v.key, label: v.label, count: 1 });
    }
  }
  // Order of first appearance in line-up order, so the filter reads like the page.
  return [...counts.values()];
}

/** A price in the page's language, with the market's currency. Never prints 0 for a missing price. */
export function formatPrice(
  price: Price,
  lang: "en" | "ar",
  market: Showroom["market"],
  onRequest: string,
): string {
  if (price.kind === "on_request") return onRequest;
  const locale = lang === "ar" ? market.locale : `en-${market.code}`;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: price.currency,
    maximumFractionDigits: 0,
  }).format(price.amount);
}
