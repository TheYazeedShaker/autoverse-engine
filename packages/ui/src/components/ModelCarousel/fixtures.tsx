import type { HeroModel, ModelCarouselProps } from "./ModelCarousel";

// Synthetic hero data for the ModelCarousel tests and stories: no real vehicle names or images.

const trim = (id: string, label: string, powerHp: number, topSpeedKph: number, accelS: number) => ({
  id,
  label,
  image: null,
  stats: { powerHp, topSpeedKph, accelS },
});

export const HERO_MODELS: HeroModel[] = [
  {
    id: "aurora",
    name: "Aurora GT",
    trims: [
      trim("aurora-lr", "Long Range", 420, 180, 6.4),
      trim("aurora-p", "Performance", 500, 210, 4.9),
    ],
  },
  { id: "vela", name: "Vela", trims: [trim("vela-1", "Base", 300, 190, 7.2)] },
  { id: "nimbus", name: "Nimbus", trims: [trim("nimbus-1", "Base", 250, 170, 8.1)] },
];

export const LABELS_EN: ModelCarouselProps["labels"] = {
  region: "Models",
  previous: "Previous model",
  next: "Next model",
  trim: "Trim",
  power: "Power",
  topSpeed: "Top speed",
  accel: "0 – 100 km/h",
  unitHp: "hp",
  unitKph: "km/h",
  unitSeconds: "s",
  configure: "Configure",
  showTrims: "Show trims",
  imagePlaceholder: "Image coming soon",
  announce: (name, position, total) => `${name}, ${position} of ${total}`,
};

export const LABELS_AR: ModelCarouselProps["labels"] = {
  region: "الطرازات",
  previous: "الطراز السابق",
  next: "الطراز التالي",
  trim: "الفئة",
  power: "القوة",
  topSpeed: "السرعة القصوى",
  accel: "0 – 100 كم/س",
  unitHp: "حصان",
  unitKph: "كم/س",
  unitSeconds: "ث",
  configure: "كوّن سيارتك",
  showTrims: "عرض الفئات",
  imagePlaceholder: "الصورة قريبًا",
  announce: (name, position, total) => `${name}، ${position} من ${total}`,
};

export const formatEn = (n: number, digits: number) =>
  new Intl.NumberFormat("en", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(n);
export const formatAr = (n: number, digits: number) =>
  new Intl.NumberFormat("ar-EG", {
    numberingSystem: "arab",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(n);
