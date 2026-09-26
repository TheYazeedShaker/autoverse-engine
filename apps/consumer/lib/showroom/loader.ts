import {
  resolveTrimStats,
  type AssetRow,
  type EfficiencyIconKind,
  type ModelRow,
  type TrimPriceRow,
  type TrimRow,
} from "@autoverse/engine-core";
import type { Logger } from "../log";
import type { CatalogSnapshot } from "./source";

// Engine rows → what the showroom shows (spec §3). Pure apart from the logger, so every rule below
// is unit tested without a database.
//
// Rules:
// - Only published models and trims, only a live brand in a live market. The source should already
//   guarantee this; checking again means a source bug can't publish a draft.
// - A missing price is "on request", never 0 (§3).
// - Prices print only for EGP markets while `trim_prices.price_egp` is the column (open Tier B
//   question, "price_egp vs per-market currency"). Any other currency shows "on request" and logs.
// - A missing image is null plus a logged warning; the component renders its placeholder (§3).
// - Nothing brand-specific lives here: a second brand renders by data alone.

export type Bilingual = { en: string; ar: string };

export type Price = { kind: "amount"; amount: number; currency: string } | { kind: "on_request" };

export interface ImageRef {
  /** Registry path. Turning it into a URL is the open asset-URL decision. */
  storagePath: string;
  width: number | null;
  height: number | null;
}

export interface TrimStats {
  drive: string | null;
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
  fuel: string | null;
  fuelCategory: string | null;
  transmission: string | null;
  body: string | null;
  efficiency: { label: Bilingual; value: string; icon: EfficiencyIconKind } | null;
  /** The lowest priced trim, or on request when none has a price. */
  fromPrice: Price;
  trims: ShowroomTrim[];
}

export interface FacetOption {
  value: string;
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
/** The only currency `price_egp` can honestly be printed in. */
const PRICE_COLUMN_CURRENCY = "EGP";
/** Kinds that are still images a page can show. Source models, documents and video are not. */
const IMAGE_KINDS: ReadonlySet<AssetRow["kind"]> = new Set(["render", "image", "per_color_render"]);

/** Null when the brand-market isn't live: the page then answers 404, same as an unknown host. */
export function buildShowroom(snapshot: CatalogSnapshot, log: Logger): Showroom | null {
  const { brand, market } = snapshot;
  if (brand.status !== "live" || !market.live || market.brand_id !== brand.id) return null;

  const priceable = market.currency === PRICE_COLUMN_CURRENCY;
  if (!priceable) {
    log("warn", "showroom_price_currency_unsupported", {
      brand: brand.slug,
      market: market.market_code,
      currency: market.currency,
    });
  }
  const prices = new Map<string, TrimPriceRow>();
  for (const p of snapshot.prices) {
    if (p.brand_id === brand.id && p.market_code === market.market_code) prices.set(p.trim_id, p);
  }

  const models: ShowroomModel[] = [];
  const published = snapshot.models
    .filter((m) => m.brand_id === brand.id && m.publish_state === "published")
    .sort((a, b) => a.order_index - b.order_index || a.slug.localeCompare(b.slug));

  for (const model of published) {
    const trimRows = snapshot.trims
      .filter(
        (t) =>
          t.model_id === model.id && t.brand_id === brand.id && t.publish_state === "published",
      )
      .sort((a, b) => a.order_index - b.order_index || a.slug.localeCompare(b.slug));
    if (trimRows.length === 0) {
      // A model section is built from its trim cards; with none there is nothing to show.
      log("warn", "showroom_model_without_trims", { brand: brand.slug, model: model.slug });
      continue;
    }
    const trims = trimRows.map((trim) =>
      buildTrim(
        model,
        trim,
        prices.get(trim.id),
        priceable,
        market.currency,
        snapshot.assets,
        log,
        brand.slug,
      ),
    );
    models.push({
      id: model.id,
      slug: model.slug,
      name: { en: model.name_en, ar: model.name_ar },
      year: model.year,
      badge: model.badge_label,
      fuel: model.fuel,
      fuelCategory: model.fuel_category,
      transmission: model.transmission,
      body: model.body_type,
      efficiency: efficiencyOf(model),
      fromPrice: lowestPrice(trims.map((t) => t.price)),
      trims,
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
        m.trims.map((t) => (t.stats.seats === null ? null : String(t.stats.seats))),
      ),
    },
  };
}

function buildTrim(
  model: ModelRow,
  trim: TrimRow,
  priceRow: TrimPriceRow | undefined,
  priceable: boolean,
  currency: string,
  assets: AssetRow[],
  log: Logger,
  brandSlug: string,
): ShowroomTrim {
  const stats = resolveTrimStats(model, trim);
  let price: Price = { kind: "on_request" };
  if (!priceRow) {
    log("warn", "showroom_price_missing", { brand: brandSlug, model: model.slug, trim: trim.slug });
  } else if (priceable && !priceRow.on_request && priceRow.price_egp !== null) {
    price = { kind: "amount", amount: Number(priceRow.price_egp), currency };
  }
  const image = (view: string): ImageRef | null => {
    const found = pickImage(assets, model, trim, view);
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
      drive: stats.drive,
      seats: stats.seats,
      accelS: stats.accel_0_100_s === null ? null : Number(stats.accel_0_100_s),
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
  assets: AssetRow[],
  model: Pick<ModelRow, "id" | "brand_id">,
  trim: Pick<TrimRow, "id">,
  view: string,
): ImageRef | null {
  const candidates = assets
    .filter(
      (a) =>
        a.brand_id === model.brand_id &&
        a.model_id === model.id &&
        a.view_key === view &&
        IMAGE_KINDS.has(a.kind),
    )
    .sort((a, b) => a.storage_path.localeCompare(b.storage_path));
  const hit =
    candidates.find((a) => a.trim_id === trim.id) ?? candidates.find((a) => a.trim_id === null);
  return hit ? { storagePath: hit.storage_path, width: hit.width, height: hit.height } : null;
}

function efficiencyOf(model: ModelRow): ShowroomModel["efficiency"] {
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
  values: (m: ShowroomModel) => (string | null)[],
): FacetOption[] {
  const counts = new Map<string, number>();
  for (const m of models) {
    // A model counts once per value, however many of its trims share it.
    for (const v of new Set(values(m))) {
      if (v !== null && v !== "") counts.set(v, (counts.get(v) ?? 0) + 1);
    }
  }
  // Order of first appearance in line-up order, so the filter reads like the page.
  return [...counts].map(([value, count]) => ({ value, count }));
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
