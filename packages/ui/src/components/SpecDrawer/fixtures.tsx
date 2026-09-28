import type { SpecDrawerProps } from "./SpecDrawer";

// Synthetic drawer content for the SpecDrawer tests and stories: no real vehicle names.

export const CONTENT_EN: Omit<SpecDrawerProps, "open" | "onOpenChange"> = {
  dir: "ltr",
  title: "Model details",
  eyebrow: "2026 · Demo Motors",
  modelName: "Aurora GT",
  trimName: "Long Range",
  price: "From EGP 3,900,000",
  image: null,
  imagePlaceholderLabel: "Image coming soon",
  pending: "Data will be added once provided by Demo Motors.",
  labels: { close: "Close", configure: "Configure" },
  tabs: [
    {
      key: "tech",
      label: "Technical data",
      groups: [
        {
          label: "Performance",
          note: null,
          rows: [
            { k: "Power", v: "500 hp" },
            { k: "Top speed", v: "210 km/h" },
          ],
        },
        {
          label: "Sound level",
          note: "Data will be added once provided by Demo Motors.",
          rows: [],
        },
      ],
    },
    {
      key: "equip",
      label: "Standard equipment",
      groups: [{ label: "Wheels", note: null, rows: [{ k: "Wheel size", v: "21 in" }] }],
    },
  ],
};

export const CONTENT_AR: Omit<SpecDrawerProps, "open" | "onOpenChange"> = {
  dir: "rtl",
  title: "تفاصيل الطراز",
  eyebrow: "٢٠٢٦ · ديمو موتورز",
  modelName: "أورورا جي تي",
  trimName: "المدى الطويل",
  price: "تبدأ من ٣٬٩٠٠٬٠٠٠ ج.م.",
  image: null,
  imagePlaceholderLabel: "الصورة قريبًا",
  pending: "ستُضاف البيانات فور توفرها من ديمو موتورز.",
  labels: { close: "إغلاق", configure: "كوّن سيارتك" },
  tabs: [
    {
      key: "tech",
      label: "البيانات الفنية",
      groups: [{ label: "الأداء", note: null, rows: [{ k: "القوة", v: "٥٠٠ حصان" }] }],
    },
  ],
};
