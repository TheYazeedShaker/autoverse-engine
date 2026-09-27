import type { Meta, StoryObj } from "@storybook/react-vite";
import { CarFront } from "lucide-react";
import type { CSSProperties } from "react";
import { Icon } from "../Icon";
import { VehicleCard, type VehicleCardProps } from "./VehicleCard";

// Fictional data only. The stand-in "image" is a Lucide glyph: stories carry no real vehicle imagery.
// Use the Direction toolbar for RTL/Arabic; the car area mirrors so the car faces the reading direction.

function StandInImage() {
  return (
    <div className="text-fg-muted grid h-full w-full place-items-end justify-center">
      <Icon icon={CarFront} size="lg" className="size-40" label="Stand-in vehicle image" />
    </div>
  );
}

const args: VehicleCardProps = {
  year: "2026",
  badge: "EV",
  title: "Aurora GT Long Range",
  attributes: [
    { icon: "fuel", label: "Electric" },
    { icon: "drive", label: "AWD" },
    { icon: "transmission", label: "Single-speed" },
  ],
  image: <StandInImage />,
  imagePlaceholderLabel: "Image coming soon",
  highlightsLabel: "Technical highlights",
  stats: [
    { icon: "accel", value: "4.9", unit: "s", label: "0–100 km/h" },
    { icon: "power", value: "500", unit: "hp", label: "Power" },
    { icon: "top-speed", value: "210", unit: "km/h", label: "Top speed" },
  ],
  details: [
    { icon: "battery", label: "Electric range", value: "480 km" },
    { icon: "seats", label: "Seating capacity", value: "5 seats" },
  ],
  configure: { label: "Configure", href: "#configure" },
  explore: { label: "Explore in detail", href: "#explore" },
  price: { label: "From", value: "EGP 3,900,000" },
};

const meta: Meta<typeof VehicleCard> = {
  title: "Showroom/VehicleCard",
  component: VehicleCard,
  args,
  decorators: [
    (Story) => (
      <div className="w-[26rem] max-w-full">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** No image registered yet: the designed placeholder (spec §3), never a broken image. */
export const Placeholder: Story = { args: { image: null } };

/** From slice 5 the app fills this slot with a client trigger that opens the spec drawer. */
export const WithTechnicalData: Story = {
  args: {
    technicalDataSlot: (
      <button
        type="button"
        className="text-fg flex min-h-12 w-full items-center px-4 text-start text-sm underline underline-offset-4"
      >
        Technical data and standard equipment ›
      </button>
    ),
  },
};

/** Before the configurator and trim pages exist, their buttons are honestly disabled. */
export const PagesNotYetLive: Story = {
  args: { configure: { label: "Configure" }, explore: { label: "Explore in detail" } },
};

export const Petrol: Story = {
  args: {
    badge: "V8",
    title: "Aurora Grand 1SX",
    attributes: [
      { icon: "fuel", label: "Petrol" },
      { icon: "drive", label: "AWD" },
      { icon: "transmission", label: "10-speed automatic" },
    ],
    details: [
      { icon: "pump", label: "Fuel consumption (combined)", value: "14.7 L/100km" },
      { icon: "seats", label: "Seating capacity", value: "7 seats" },
    ],
  },
};

export const Arabic: Story = {
  globals: { direction: "rtl" },
  args: {
    title: "أورورا جي تي",
    attributes: [
      { icon: "fuel", label: "كهربائي" },
      { icon: "drive", label: "دفع كلي" },
      { icon: "transmission", label: "سرعة واحدة" },
    ],
    imagePlaceholderLabel: "الصورة قريبًا",
    highlightsLabel: "أبرز المواصفات",
    stats: [
      { icon: "accel", value: "4.9", unit: "ث", label: "0 – 100 كم/س" },
      { icon: "power", value: "500", unit: "حصان", label: "القوة" },
      { icon: "top-speed", value: "210", unit: "كم/س", label: "السرعة القصوى" },
    ],
    details: [
      { icon: "battery", label: "المدى الكهربائي", value: "480 كم" },
      { icon: "seats", label: "عدد المقاعد", value: "5 مقاعد" },
    ],
    configure: { label: "كوّن سيارتك", href: "#configure" },
    explore: { label: "استكشف التفاصيل", href: "#explore" },
    price: { label: "تبدأ من", value: "٣٬٩٠٠٬٠٠٠ ج.م." },
  },
};

/** A brand theme only changes the accent family (theming REV); the card surface stays the same. */
export const WithABrandAccent: Story = {
  decorators: [
    (Story) => (
      <div
        style={
          {
            "--av-accent": "var(--av-status-error)",
            "--av-accent-hover": "var(--av-on-error)",
            "--av-on-accent": "var(--av-mist)",
          } as CSSProperties
        }
      >
        <Story />
      </div>
    ),
  ],
};
