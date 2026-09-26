// Showroom copy, EN and AR. The page's i18n layer (spec §8): the approved prototype's `L` strings
// are the copy source, and each slice adds its own. Nothing brand-specific: a brand's words (names,
// footer text) come from data.

export const COPY = {
  en: {
    priceOnRequest: "Price on request",
    from: "From",
    theRange: "The Range",
    modelRange: "Model Range",
    configure: "Configure",
    explore: "Explore in Detail",
    technicalData: "Technical data and standard equipment",
    highlights: "Technical highlights",
    imageComingSoon: "Image coming soon",
    sideView: (name: string) => `${name}, side view`,
    accel: "0 – 100 km/h",
    power: "Power",
    topSpeed: "Top speed",
    seatingCapacity: "Seating capacity",
    seats: (n: string, count = Number.NaN) => (count === 1 ? `${n} seat` : `${n} seats`),
    unitSeconds: "s",
    unitHp: "hp",
    unitKph: "km/h",
  },
  ar: {
    priceOnRequest: "السعر عند الطلب",
    from: "تبدأ من",
    theRange: "التشكيلة",
    modelRange: "تشكيلة الطرازات",
    configure: "كوّن سيارتك",
    explore: "استكشف التفاصيل",
    technicalData: "البيانات الفنية والتجهيزات القياسية",
    highlights: "أبرز المواصفات",
    imageComingSoon: "الصورة قريبًا",
    sideView: (name: string) => `${name}، منظر جانبي`,
    accel: "0 – 100 كم/س",
    power: "القوة",
    topSpeed: "السرعة القصوى",
    seatingCapacity: "عدد المقاعد",
    // Arabic plural forms for a counted noun (Intl.PluralRules "ar"): one, two, few (3–10), other (11+).
    seats: (n: string, count = Number.NaN) => {
      switch (new Intl.PluralRules("ar").select(count)) {
        case "one":
          return "مقعد واحد";
        case "two":
          return "مقعدان";
        case "few":
          return `${n} مقاعد`;
        default:
          return `${n} مقعدًا`;
      }
    },
    unitSeconds: "ث",
    unitHp: "حصان",
    unitKph: "كم/س",
  },
} as const;

export type Lang = keyof typeof COPY;
export type Copy = (typeof COPY)[Lang];
