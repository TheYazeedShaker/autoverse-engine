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

// The spec ledger (migration 20260928120000; spec §5.8). A per-trim row's values are keyed by trim
// id, published trims only, each exactly {en, ar}.
const Bilingual = z.strictObject({ en: text, ar: text });

export const CatalogSpecTab = z.strictObject({
  id: uuid,
  model_id: uuid,
  key: text,
  title_en: text,
  title_ar: text,
  order_index: z.number().int(),
});

export const CatalogSpecGroup = z.strictObject({
  id: uuid,
  tab_id: uuid,
  model_id: uuid,
  title_en: text,
  title_ar: text,
  note_en: maybeText,
  note_ar: maybeText,
  order_index: z.number().int(),
});

export const CatalogSpecRow = z.strictObject({
  id: uuid,
  group_id: uuid,
  model_id: uuid,
  key_en: text,
  key_ar: text,
  scope: z.enum(["all_trims", "per_trim"]),
  value_en: maybeText,
  value_ar: maybeText,
  trim_values: z.record(uuid, Bilingual).nullable(),
  order_index: z.number().int(),
});

export const CatalogSpec = z.strictObject({
  tabs: z.array(CatalogSpecTab),
  groups: z.array(CatalogSpecGroup),
  rows: z.array(CatalogSpecRow),
});

// The lead form's consent wording (slice 7), the same rules the database enforces
// (consent_texts): a short version label, at most 2000 characters (code points, as Postgres counts),
// at least one non-space character, and {Brand} as the only placeholder.
const ConsentWording = z
  .string()
  .refine((s) => [...s].length <= 2000, "consent text over 2000 characters")
  .refine((s) => /\S/.test(s), "blank consent text")
  .refine((s) => !/[{}]/.test(s.replaceAll("{Brand}", "")), "unknown placeholder");

export const CatalogLeadConsent = z.strictObject({
  version: z.string().regex(/^[a-z0-9][a-z0-9._-]{0,31}$/),
  en: ConsentWording,
  ar: ConsentWording,
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
  // Optional so the page renders whether the deploy or the migration lands first; absent = no
  // ledger (the drawer shows its "data will be added" state).
  spec: CatalogSpec.optional(),
  // Slice 7 (migration 20260928140000). Null = no current consent text: the page shows no lead
  // CTAs. Optional for the same deploy-order reason as `spec`. A row the database accepted but this
  // refuses (the rules above mirror the database's, but whitespace classes can differ at the edges)
  // becomes null too: consent rows are append-only, so it must cost the lead CTAs, never the whole
  // showroom. The page logs a missing consent text (slice 7 UI).
  lead_consent: CatalogLeadConsent.nullable().optional().catch(null),
  // The brand's newest unrevoked web publishable key (ADR 0013: public by design). Null = none:
  // no lead CTAs either.
  capture_key: z
    .string()
    .regex(/^pk_[A-Za-z0-9]{32}$/)
    .nullable()
    .optional(),
});

export type CatalogSnapshot = z.infer<typeof ShowroomCatalog>;
export type CatalogModelRow = z.infer<typeof CatalogModel>;
export type CatalogTrimRow = z.infer<typeof CatalogTrim>;
export type CatalogAssetRow = z.infer<typeof CatalogAsset>;
export type CatalogThemeRow = z.infer<typeof CatalogTheme>;
export type CatalogSpecRowRow = z.infer<typeof CatalogSpecRow>;
export type CatalogSpecGroupRow = z.infer<typeof CatalogSpecGroup>;
export type CatalogSpecTabRow = z.infer<typeof CatalogSpecTab>;
export type CatalogLeadConsentRow = z.infer<typeof CatalogLeadConsent>;
