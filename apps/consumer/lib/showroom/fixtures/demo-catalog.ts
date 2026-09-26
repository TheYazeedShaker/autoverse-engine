import type { CatalogSnapshot } from "../source";

// The demo brand as a catalogue snapshot: seed-style DATA for tests and the dev-only fixture
// source. No real manufacturer, model or price. Theme values are brand data (validated by the
// database in real use), so this folder is exempt from the hardcoded-colour lint.

const BRAND = "00000000-0000-4000-8000-00000000d001";
const M1 = "00000000-0000-4000-8000-0000000000a1";
const M2 = "00000000-0000-4000-8000-0000000000a2";
const M3 = "00000000-0000-4000-8000-0000000000a3";

export const demoCatalog = (): CatalogSnapshot => ({
  brand: { id: BRAND, slug: "demo", name: "Demo Motors", status: "live" },
  market: {
    brand_id: BRAND,
    market_code: "EG",
    currency: "EGP",
    locale: "ar-EG",
    rtl: false,
    live: true,
    subdomain: "demo",
    consent_defaults: {},
    whatsapp_number: null,
    footer_description_en: null,
    footer_description_ar: null,
    footer_link_columns: [],
    social_links: [],
  },
  theme: {
    brand_id: BRAND,
    market_code: "EG",
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
    model(M1, "demo-suv", "Demo SUV", "ديمو إس يو في", 0, {
      body_type: "SUV",
      fuel: "Petrol",
      fuel_category: "Petrol",
      drive: "AWD",
      transmission: "8-Speed Auto",
      seats: 7,
      accel_0_100_s: 6.4,
      power_hp: 420,
      top_speed_kph: 200,
      efficiency_label_en: "Fuel consumption (combined)",
      efficiency_label_ar: "استهلاك الوقود (مجمع)",
      efficiency_value: "11.2 L/100km",
      efficiency_icon_kind: "pump",
    }),
    model(M2, "demo-ev", "Demo EV", "ديمو إي في", 1, {
      body_type: "SUV",
      fuel: "Electric",
      fuel_category: "EV",
      drive: "AWD",
      transmission: "Single-speed",
      seats: 5,
      accel_0_100_s: 4.9,
      power_hp: 500,
      top_speed_kph: 210,
      efficiency_label_en: "Electric range",
      efficiency_label_ar: "المدى الكهربائي",
      efficiency_value: "480 km",
      efficiency_icon_kind: "battery",
    }),
    model(M3, "demo-draft", "Demo Draft", "ديمو مسودة", 2, { publish_state: "draft" }),
  ],
  trims: [
    trim("00000000-0000-4000-8000-0000000000b1", M1, "base", "Base", "أساسي", 0),
    trim("00000000-0000-4000-8000-0000000000b2", M1, "sport", "Sport", "سبورت", 1, {
      power_hp: 460,
      accel_0_100_s: 5.9,
    }),
    trim("00000000-0000-4000-8000-0000000000b3", M2, "long-range", "Long Range", "مدى طويل", 0, {
      drive: "RWD",
    }),
  ],
  prices: [
    price("00000000-0000-4000-8000-0000000000b1", 3_900_000),
    price("00000000-0000-4000-8000-0000000000b2", 4_400_000),
    {
      brand_id: BRAND,
      trim_id: "00000000-0000-4000-8000-0000000000b3",
      market_code: "EG",
      price_egp: null,
      on_request: true,
    },
  ],
  assets: [
    asset("c1", M1, "00000000-0000-4000-8000-0000000000b1", "side"),
    asset("c2", M1, "00000000-0000-4000-8000-0000000000b1", "front-34"),
    asset("c3", M1, null, "side"),
    asset("c4", M2, "00000000-0000-4000-8000-0000000000b3", "side"),
  ],
});

function model(
  id: string,
  slug: string,
  name_en: string,
  name_ar: string,
  order_index: number,
  over: Partial<CatalogSnapshot["models"][number]>,
): CatalogSnapshot["models"][number] {
  return {
    id,
    brand_id: BRAND,
    slug,
    name_en,
    name_ar,
    year: 2026,
    body_type: null,
    badge_label: null,
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
    publish_state: "published",
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
  over: Partial<CatalogSnapshot["trims"][number]> = {},
): CatalogSnapshot["trims"][number] {
  return {
    id,
    brand_id: BRAND,
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
    publish_state: "published",
    ...over,
  };
}

function price(trim_id: string, amount: number): CatalogSnapshot["prices"][number] {
  return { brand_id: BRAND, trim_id, market_code: "EG", price_egp: amount, on_request: false };
}

function asset(
  key: string,
  model_id: string,
  trim_id: string | null,
  view_key: string,
): CatalogSnapshot["assets"][number] {
  return {
    id: `00000000-0000-4000-8000-0000000000${key}`,
    brand_id: BRAND,
    kind: "render",
    storage_path: `assets/demo/${model_id.slice(-2)}/v1/${trim_id ? trim_id.slice(-2) : "all"}-${view_key}.png`,
    model_id,
    trim_id,
    view_key,
    width: 1920,
    height: 1080,
  };
}
