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
    // Filters (slice 3, spec §5.5). `n` is the formatted number, `count` the number itself.
    filters: "Filters",
    filtersActive: (n: string) => `Filters · ${n}`,
    clearAll: "Clear all",
    searchModels: "Search models",
    sortBy: "Sort by",
    sort: {
      featured: "Featured",
      name: "Name A–Z",
      power: "Power · high to low",
      accel: "0–100 · quickest first",
    },
    sortShort: {
      featured: "Sort · Featured",
      name: "Sort · Name A–Z",
      power: "Sort · Power",
      accel: "Sort · 0–100",
    },
    facet: { body: "Body type", fuel: "Fuel", drive: "Drive", seats: "Seats" },
    models: (n: string, count = Number.NaN) => (count === 1 ? `${n} model` : `${n} models`),
    resultCount: (shown: string, total: string, totalCount = Number.NaN) =>
      `${shown} of ${total} ${totalCount === 1 ? "model" : "models"}`,
    showResults: (n: string, count = Number.NaN) =>
      count === 1 ? `Show ${n} model` : `Show ${n} models`,
    selectedCount: (n: string) => `${n} selected`,
    noMatch: "No models match these filters.",
    // Hero and dock (slice 4, spec §5.3–5.4).
    modelsLabel: "Models",
    language: "Language",
    bookTestDrive: "Book a Test Drive",
    // Spec drawer (slice 5, spec §5.8).
    modelDetails: "Model details",
    close: "Close",
    specPending: (brand: string) => `Data will be added once provided by ${brand}.`,
    // Compare (slice 6, spec §5.9). `n` is the formatted number, `count` the number itself.
    compare: "Compare",
    compareRegion: "Comparison",
    remove: "Remove",
    removeItem: (name: string) => `Remove ${name}`,
    compareN: (n: string) => `Compare ${n}`,
    compareStatus: (n: string, count = Number.NaN) =>
      count === 0
        ? "No trims selected for comparison"
        : `${n} ${count === 1 ? "trim" : "trims"} selected for comparison`,
    compareLimit: "Two trims are compared at a time. Remove one to pick another.",
    compareTitle: "Compare models",
    compareSoon: "The side-by-side comparison is coming soon.",
    backToRange: "Back to the range",
    previousModel: "Previous model",
    nextModel: "Next model",
    trim: "Trim",
    showTrims: "Show trims",
    frontView: (name: string) => `${name}, front three-quarter view`,
    announceModel: (name: string, position: string, total: string) =>
      `${name}, ${position} of ${total}`,
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
    // Arabic plural forms for a counted noun (Intl.PluralRules "ar"): one, two, few (3–10), and
    // many (11–99) in the default branch (a car never seats 100+, the "other" form).
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
    filters: "الفلاتر",
    filtersActive: (n: string) => `الفلاتر · ${n}`,
    clearAll: "مسح الكل",
    searchModels: "ابحث عن طراز",
    sortBy: "ترتيب حسب",
    sort: {
      featured: "المميز",
      name: "الاسم أ–ي",
      power: "القوة · من الأعلى",
      accel: "0–100 · الأسرع أولاً",
    },
    sortShort: {
      featured: "ترتيب · المميز",
      name: "ترتيب · الاسم",
      power: "ترتيب · القوة",
      accel: "ترتيب · 0–100",
    },
    facet: { body: "نوع الهيكل", fuel: "الوقود", drive: "الدفع", seats: "المقاعد" },
    // Arabic plural forms (Intl.PluralRules "ar"): zero (0), one (1), two (2), few (3–10),
    // many (11–99), other (100, 101, 102, …).
    models: (n: string, count = Number.NaN) => {
      switch (new Intl.PluralRules("ar").select(count)) {
        case "one":
          return "طراز واحد";
        case "two":
          return "طرازان";
        case "few":
          return `${n} طرازات`;
        case "many":
          return `${n} طرازًا`;
        default:
          return `${n} طراز`;
      }
    },
    // "4 من 5 طرازات", as the approved page; the noun agrees with the total.
    resultCount: (shown: string, total: string, totalCount = Number.NaN) => {
      const form = new Intl.PluralRules("ar").select(totalCount);
      const noun =
        form === "many" ? "طرازًا" : form === "few" || form === "two" ? "طرازات" : "طراز"; // zero, one, other (100+)
      return `${shown} من ${total} ${noun}`;
    },
    showResults: (n: string, count = Number.NaN) => {
      switch (new Intl.PluralRules("ar").select(count)) {
        case "one":
          return "عرض طراز واحد";
        case "two":
          return "عرض طرازين";
        case "few":
          return `عرض ${n} طرازات`;
        case "many":
          return `عرض ${n} طرازًا`;
        default:
          return `عرض ${n} طراز`;
      }
    },
    selectedCount: (n: string) => `محدد: ${n}`,
    noMatch: "لا توجد طرازات تطابق هذه الفلاتر.",
    modelsLabel: "الطرازات",
    language: "اللغة",
    bookTestDrive: "احجز تجربة قيادة",
    modelDetails: "تفاصيل الطراز",
    close: "إغلاق",
    specPending: (brand: string) => `ستُضاف البيانات فور توفرها من ${brand}.`,
    compare: "قارن",
    compareRegion: "المقارنة",
    remove: "إزالة",
    removeItem: (name: string) => `إزالة ${name}`,
    compareN: (n: string) => `قارن ${n}`,
    // Arabic plural forms (Intl.PluralRules "ar"): one, two, few (3–10), many (11–99), other.
    compareStatus: (n: string, count = Number.NaN) => {
      switch (new Intl.PluralRules("ar").select(count)) {
        case "zero":
          return "لا توجد فئات محددة للمقارنة";
        case "one":
          return "فئة واحدة محددة للمقارنة";
        case "two":
          return "فئتان محددتان للمقارنة";
        case "few":
          return `${n} فئات محددة للمقارنة`;
        default:
          return `${n} فئة محددة للمقارنة`;
      }
    },
    compareLimit: "تتم المقارنة بين فئتين فقط. أزِل إحداهما لاختيار أخرى.",
    compareTitle: "قارن الطرازات",
    compareSoon: "المقارنة جنبًا إلى جنب قريبًا.",
    backToRange: "العودة إلى التشكيلة",
    previousModel: "الطراز السابق",
    nextModel: "الطراز التالي",
    trim: "الفئة",
    showTrims: "عرض الفئات",
    frontView: (name: string) => `${name}، منظر أمامي جانبي`,
    announceModel: (name: string, position: string, total: string) =>
      `${name}، ${position} من ${total}`,
  },
} as const;

export type Lang = keyof typeof COPY;
export type Copy = (typeof COPY)[Lang];
