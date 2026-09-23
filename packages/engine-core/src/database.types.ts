// Row shapes for the engine's schema.
//
// HAND-WRITTEN, deliberately. `supabase gen types typescript` needs either Docker or a hosted
// database carrying these migrations, and the hosted project is still on the tenancy migration
// alone (0-H has not reached main yet). These shapes mirror the 1·A migrations exactly; regenerate
// them with the command in the README the moment the hosted database is up, and this file becomes
// generated output rather than a transcription.
//
// Only the columns the repositories read or write are listed. Adding one here without adding it to
// the migration is a type error waiting to happen at runtime, so keep the two together.

export type PublishState = "draft" | "ready" | "published";
export type SpecRowScope = "all_trims" | "per_trim";
export type LeadType = "test_drive" | "quote" | "contact" | "whatsapp";
export type LeadStatus = "new" | "contacted" | "qualified" | "won" | "lost";
export type ActivityKind = "status_change" | "contact_attempt" | "note" | "score_update";

export interface BrandRow {
  id: string;
  slug: string;
  name: string;
  status: "draft" | "live" | "paused";
  tier: "free" | "tier1" | "tier2" | "tier3";
}

export interface BrandMarketRow {
  brand_id: string;
  market_code: string;
  currency: string;
  locale: string;
  rtl: boolean;
  live: boolean;
  whatsapp_number: string | null;
}

export interface ModelRow {
  id: string;
  brand_id: string;
  slug: string;
  name_en: string;
  name_ar: string;
  year: number | null;
  body_type: string | null;
  badge_label: string | null;
  seats: number | null;
  accel_0_100_s: number | null;
  power_hp: number | null;
  top_speed_kph: number | null;
  torque_nm: number | null;
  order_index: number;
  publish_state: PublishState;
}

export interface TrimRow {
  id: string;
  brand_id: string;
  model_id: string;
  slug: string;
  name_en: string;
  name_ar: string;
  /** Overrides: null means "inherit the model's value". */
  seats: number | null;
  accel_0_100_s: number | null;
  power_hp: number | null;
  top_speed_kph: number | null;
  torque_nm: number | null;
  order_index: number;
  publish_state: PublishState;
}

export interface SpecRowRow {
  id: string;
  brand_id: string;
  model_id: string;
  group_id: string;
  key_en: string;
  key_ar: string;
  scope: SpecRowScope;
  value_en: string | null;
  value_ar: string | null;
  /** { "<trim_id>": { "en": "...", "ar": "..." } } */
  trim_values: Record<string, { en: string; ar: string }> | null;
  order_index: number;
}

export interface BrandThemeRow {
  brand_id: string;
  market_code: string;
  accent_hex: string;
  on_accent: "black" | "white";
  hover_hex: string;
  muted_hex: string;
  focus_hex: string;
  logo_light_asset_ref: string | null;
  logo_dark_asset_ref: string | null;
  favicon_asset_ref: string | null;
}

export interface LeadRow {
  id: string;
  brand_id: string;
  market_code: string;
  full_name: string;
  phone: string;
  city: string | null;
  model_id: string | null;
  trim_id: string | null;
  preferred_time: string | null;
  type: LeadType;
  status: LeadStatus;
  score: number | null;
  consent_text_version: string;
  consent_at: string;
  session_id: string | null;
  created_at: string;
}

export interface EventRow {
  id: string;
  brand_id: string;
  session_id: string | null;
  market_code: string | null;
  model_id: string | null;
  trim_id: string | null;
  kind: string;
  payload: Record<string, unknown>;
  received_at: string;
  processed_at: string | null;
}
