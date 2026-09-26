import type { EfficiencyIconKind, OptionKind } from "@autoverse/engine-core";
import { z } from "zod";

// The payload of `public.showroom_catalog(p_subdomain)` (migration 20260926170000, ADR 0018), as
// the consumer receives it. The database builds every object key by key; this schema is the other
// side of that boundary (CLAUDE.md: every cross-boundary payload is Zod-validated on both sides).
//
// Every object is STRICT: an unexpected key fails the parse, so a column added to the function
// without a matching change here is caught instead of silently flowing to the page. ADR 0018 is
// why there is no brand id, status or publish state: the function returns only live, published
// rows of one brand-market, so those are guaranteed by construction, not re-checked per row.

const text = z.string();
const maybeText = z.string().nullable();
const maybeInt = z.number().int().nullable();
const maybeNum = z.number().nullable();
// Any 8-4-4-4-12 hex id: seeds may use ids that are not RFC 4122 variants.
const uuid = z.guid();

const LeadCity = z.strictObject({ id: text, en: text, ar: text });

// The same shape the database enforces on assets.public_path (assets_public_path_format): a
// relative object key, never a scheme, a leading slash, a `..` segment or `//`. Slice 2 builds image
// URLs from it, so this side of the boundary checks it too.
const PublicPath = z
  .string()
  .max(512)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._/-]*$/)
  .refine((p) => !/(^|\/)\.\.(\/|$)/.test(p) && !p.includes("//"), "unsafe public_path");

export const CatalogMarket = z.strictObject({
  market_code: z.string().regex(/^[A-Z]{2}$/),
  currency: z.string().regex(/^[A-Z]{3}$/),
  locale: text,
  rtl: z.boolean(),
  subdomain: text,
  whatsapp_number: maybeText,
  footer_description_en: maybeText,
  footer_description_ar: maybeText,
  footer_tagline_en: maybeText,
  footer_tagline_ar: maybeText,
  // Passed through unvalidated for now. TODO(footer slice): validate these strictly before any of
  // it reaches an href (https, mailto and tel only; never javascript:).
  footer_link_columns: z.array(z.unknown()),
  social_links: z.array(z.unknown()),
  hotline: maybeText,
  contact_email: maybeText,
  cities_en: maybeText,
  cities_ar: maybeText,
  lead_cities: z.array(LeadCity),
});

export const CatalogTheme = z.strictObject({
  accent_hex: text,
  on_accent: z.enum(["black", "white"]),
  hover_hex: text,
  muted_hex: text,
  focus_hex: text,
  logo_light_asset_ref: maybeText,
  logo_dark_asset_ref: maybeText,
  favicon_asset_ref: maybeText,
});

export const CatalogModel = z.strictObject({
  id: uuid,
  slug: text,
  name_en: text,
  name_ar: text,
  year: maybeInt,
  badge_label: maybeText,
  // Vocabulary keys (#69), resolved through `vocabulary`.
  body_type: maybeText,
  fuel: maybeText,
  fuel_category: maybeText,
  drive: maybeText,
  transmission: maybeText,
  seats: maybeInt,
  accel_0_100_s: maybeNum,
  power_hp: maybeInt,
  top_speed_kph: maybeInt,
  torque_nm: maybeInt,
  efficiency_label_en: maybeText,
  efficiency_label_ar: maybeText,
  efficiency_value: maybeText,
  efficiency_icon_kind: z
    .enum(["pump", "battery", "range"] as const satisfies readonly EfficiencyIconKind[])
    .nullable(),
  order_index: z.number().int(),
});

export const CatalogTrim = z.strictObject({
  id: uuid,
  model_id: uuid,
  slug: text,
  name_en: text,
  name_ar: text,
  // Null = inherit the model's.
  drive: maybeText,
  seats: maybeInt,
  accel_0_100_s: maybeNum,
  power_hp: maybeInt,
  top_speed_kph: maybeInt,
  torque_nm: maybeInt,
  order_index: z.number().int(),
});

export const CatalogPrice = z.strictObject({
  trim_id: uuid,
  // In the market's currency (#67). Null exactly when on request.
  price_amount: maybeNum,
  on_request: z.boolean(),
});

export const CatalogAsset = z.strictObject({
  model_id: uuid,
  trim_id: uuid.nullable(),
  view_key: z.enum(["side", "front-34"]),
  // Object key in the public published bucket (ADR 0018). Never a private storage path.
  public_path: PublicPath,
  width: maybeInt,
  height: maybeInt,
});

export const CatalogVocabulary = z.strictObject({
  id: text,
  kind: z.enum([
    "body_type",
    "fuel",
    "drive",
    "transmission",
  ] as const satisfies readonly OptionKind[]),
  display_en: text,
  display_ar: text,
});

export const ShowroomCatalog = z.strictObject({
  brand: z.strictObject({ slug: text, name: text }),
  market: CatalogMarket,
  theme: CatalogTheme.nullable(),
  models: z.array(CatalogModel),
  trims: z.array(CatalogTrim),
  prices: z.array(CatalogPrice),
  assets: z.array(CatalogAsset),
  vocabulary: z.array(CatalogVocabulary),
});

export type CatalogSnapshot = z.infer<typeof ShowroomCatalog>;
export type CatalogModelRow = z.infer<typeof CatalogModel>;
export type CatalogTrimRow = z.infer<typeof CatalogTrim>;
export type CatalogAssetRow = z.infer<typeof CatalogAsset>;
export type CatalogThemeRow = z.infer<typeof CatalogTheme>;
