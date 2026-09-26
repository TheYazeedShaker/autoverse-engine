// Showroom copy, EN and AR. The start of the page's i18n layer (spec §8): the prototype's `L`
// strings are the copy source, and later slices add theirs here. Nothing brand-specific: a brand's
// own words (names, footer text) come from data.

export const COPY = {
  en: {
    priceOnRequest: "Price on request",
    from: "From",
    theRange: "The range",
  },
  ar: {
    priceOnRequest: "السعر عند الطلب",
    from: "يبدأ من",
    theRange: "التشكيلة",
  },
} as const;

export type Lang = keyof typeof COPY;
