import type { CatalogSnapshot } from "../catalog-schema";

// The demo brand as a `showroom_catalog` payload (ADR 0018): seed-style DATA for tests and the
// local fixture source. No real manufacturer, model or price. Theme values are brand data
// (validated by the database in real use), so this folder is exempt from the hardcoded-colour
// lint. Ids are fixed so tests can refer to them.

export const DEMO_IDS = {
  suv: "00000000-0000-4000-8000-0000000000a1",
  ev: "00000000-0000-4000-8000-0000000000a2",
  suvBase: "00000000-0000-4000-8000-0000000000b1",
  suvSport: "00000000-0000-4000-8000-0000000000b2",
  evLongRange: "00000000-0000-4000-8000-0000000000b3",
} as const;

export const demoCatalog = (): CatalogSnapshot => ({
  brand: { slug: "demo", name: "Demo Motors" },
  market: {
    market_code: "EG",
    currency: "EGP",
    locale: "ar-EG",
    rtl: false,
    subdomain: "demo",
    whatsapp_number: null,
    footer_description_en: null,
    footer_description_ar: null,
    footer_tagline_en: null,
    footer_tagline_ar: null,
    footer_link_columns: [],
    social_links: [],
    hotline: null,
    contact_email: null,
    cities_en: null,
    cities_ar: null,
    lead_cities: [],
  },
  theme: {
    accent_hex: "#1F4E8C",
    on_accent: "white",
    hover_hex: "#173B69",
    muted_hex: "#DCE4EE",
    focus_hex: "#1F4E8C",
    logo_light_asset_ref: null,
    logo_dark_asset_ref: null,
    favicon_asset_ref: null,
  },
  models: [
    model(DEMO_IDS.suv, "demo-suv", "Demo SUV", "ديمو إس يو في", 0, {
      body_type: "suv",
      fuel: "petrol",
      fuel_category: "petrol",
      drive: "awd",
      transmission: "automatic-8-speed",
      seats: 7,
      accel_0_100_s: 6.4,
      power_hp: 420,
      top_speed_kph: 200,
      efficiency_label_en: "Fuel consumption (combined)",
      efficiency_label_ar: "استهلاك الوقود (مجمع)",
      efficiency_value: "11.2 L/100km",
      efficiency_icon_kind: "pump",
    }),
    model(DEMO_IDS.ev, "demo-ev", "Demo EV", "ديمو إي في", 1, {
      body_type: "suv",
      fuel: "ev",
      fuel_category: "ev",
      drive: "awd",
      transmission: "single-speed",
      seats: 5,
      accel_0_100_s: 4.9,
      power_hp: 500,
      top_speed_kph: 210,
      efficiency_label_en: "Electric range",
      efficiency_label_ar: "المدى الكهربائي",
      efficiency_value: "480 km",
      efficiency_icon_kind: "battery",
    }),
  ],
  trims: [
    trim(DEMO_IDS.suvBase, DEMO_IDS.suv, "base", "Base", "أساسي", 0),
    trim(DEMO_IDS.suvSport, DEMO_IDS.suv, "sport", "Sport", "سبورت", 1, {
      power_hp: 460,
      accel_0_100_s: 5.9,
    }),
    trim(DEMO_IDS.evLongRange, DEMO_IDS.ev, "long-range", "Long Range", "مدى طويل", 0, {
      drive: "rwd",
    }),
  ],
  prices: [
    { trim_id: DEMO_IDS.suvBase, price_amount: 3_900_000, on_request: false },
    { trim_id: DEMO_IDS.suvSport, price_amount: 4_400_000, on_request: false },
    { trim_id: DEMO_IDS.evLongRange, price_amount: null, on_request: true },
  ],
  assets: [
    asset(DEMO_IDS.suv, DEMO_IDS.suvBase, "side"),
    asset(DEMO_IDS.suv, DEMO_IDS.suvBase, "front-34"),
    asset(DEMO_IDS.suv, null, "side"),
    asset(DEMO_IDS.ev, DEMO_IDS.evLongRange, "side"),
  ],
  vocabulary: [
    vocab("suv", "body_type", "SUV", "إس يو في"),
    vocab("petrol", "fuel", "Petrol", "بنزين"),
    vocab("ev", "fuel", "Electric", "كهربائي"),
    vocab("awd", "drive", "AWD", "دفع كلي"),
    vocab("rwd", "drive", "RWD", "دفع خلفي"),
    vocab("automatic-8-speed", "transmission", "8-speed automatic", "أوتوماتيك 8 سرعات"),
    vocab("single-speed", "transmission", "Single-speed", "سرعة واحدة"),
  ],
});

type Model = CatalogSnapshot["models"][number];
type Trim = CatalogSnapshot["trims"][number];

function model(
  id: string,
  slug: string,
  name_en: string,
  name_ar: string,
  order_index: number,
  over: Partial<Model>,
): Model {
  return {
    id,
    slug,
    name_en,
    name_ar,
    year: 2026,
    badge_label: null,
    body_type: null,
    fuel: null,
    fuel_category: null,
    drive: null,
    transmission: null,
    seats: null,
    accel_0_100_s: null,
    power_hp: null,
    top_speed_kph: null,
    torque_nm: null,
    efficiency_label_en: null,
    efficiency_label_ar: null,
    efficiency_value: null,
    efficiency_icon_kind: null,
    order_index,
    ...over,
  };
}

function trim(
  id: string,
  model_id: string,
  slug: string,
  name_en: string,
  name_ar: string,
  order_index: number,
  over: Partial<Trim> = {},
): Trim {
  return {
    id,
    model_id,
    slug,
    name_en,
    name_ar,
    drive: null,
    seats: null,
    accel_0_100_s: null,
    power_hp: null,
    top_speed_kph: null,
    torque_nm: null,
    order_index,
    ...over,
  };
}

function asset(
  model_id: string,
  trim_id: string | null,
  view_key: "side" | "front-34",
): CatalogSnapshot["assets"][number] {
  return {
    model_id,
    trim_id,
    view_key,
    public_path: `demo/${model_id.slice(-2)}/${trim_id ? trim_id.slice(-2) : "all"}-${view_key}.png`,
    width: 1920,
    height: 1080,
  };
}

function vocab(
  id: string,
  kind: CatalogSnapshot["vocabulary"][number]["kind"],
  display_en: string,
  display_ar: string,
): CatalogSnapshot["vocabulary"][number] {
  return { id, kind, display_en, display_ar };
}
