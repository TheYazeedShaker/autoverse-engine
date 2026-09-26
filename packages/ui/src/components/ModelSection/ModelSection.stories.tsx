import type { Meta, StoryObj } from "@storybook/react-vite";
import { VehicleCard, type VehicleCardProps } from "../VehicleCard";
import { ModelSection } from "./ModelSection";

// A model's block: header band + its trim cards in the 3-per-row grid (spec §5.6). Cards are never
// stretched: one or two cards keep a single column's width, start-aligned in the reading direction.

const trim = (title: string, price: string): VehicleCardProps => ({
  year: "2026",
  badge: "EV",
  title,
  attributes: [
    { icon: "fuel", label: "Electric" },
    { icon: "drive", label: "AWD" },
    { icon: "transmission", label: "Single-speed" },
  ],
  image: null,
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
  price: { label: "From", value: price },
});

const meta = {
  title: "Showroom/ModelSection",
  component: ModelSection,
  parameters: { layout: "padded" },
  args: {
    id: "aurora-gt",
    name: "Aurora GT",
    descriptor: "SUV · Electric · AWD",
    price: "From EGP 3,900,000",
    children: null,
  },
} satisfies Meta<typeof ModelSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TwoTrims: Story = {
  render: (args) => (
    <ModelSection {...args}>
      <VehicleCard {...trim("Aurora GT Long Range", "EGP 3,900,000")} />
      <VehicleCard {...trim("Aurora GT Performance", "EGP 4,400,000")} />
    </ModelSection>
  ),
};

/** One trim still gets its section, and its card keeps one column's width. */
export const OneTrim: Story = {
  render: (args) => (
    <ModelSection {...args}>
      <VehicleCard {...trim("Aurora GT Long Range", "EGP 3,900,000")} />
    </ModelSection>
  ),
};

export const ThreeTrims: Story = {
  render: (args) => (
    <ModelSection {...args}>
      <VehicleCard {...trim("Aurora GT Standard", "EGP 3,400,000")} />
      <VehicleCard {...trim("Aurora GT Long Range", "EGP 3,900,000")} />
      <VehicleCard {...trim("Aurora GT Performance", "EGP 4,400,000")} />
    </ModelSection>
  ),
};

export const Collapsed: Story = {
  args: { defaultOpen: false },
  render: (args) => (
    <ModelSection {...args}>
      <VehicleCard {...trim("Aurora GT Long Range", "EGP 3,900,000")} />
    </ModelSection>
  ),
};

export const Arabic: Story = {
  globals: { direction: "rtl" },
  args: {
    name: "أورورا جي تي",
    descriptor: "SUV · كهربائي · دفع كلي",
    price: "تبدأ من ٣٬٩٠٠٬٠٠٠ ج.م.",
  },
  render: (args) => (
    <ModelSection {...args}>
      <VehicleCard {...trim("أورورا جي تي", "٣٬٩٠٠٬٠٠٠ ج.م.")} />
    </ModelSection>
  ),
};
