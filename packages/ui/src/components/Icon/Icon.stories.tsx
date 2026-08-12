import type { Meta, StoryObj } from "@storybook/react-vite";
import { Car, ChevronRight, Gauge, Star } from "lucide-react";
import { Icon } from "./Icon";

const meta = {
  title: "Primitives/Icon",
  component: Icon,
  args: { icon: Star, size: "md" },
  argTypes: { icon: { control: false } },
} satisfies Meta<typeof Icon>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { label: "Favorite" } };

export const Sizes: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
      <Icon icon={Star} size="sm" />
      <Icon icon={Star} size="md" />
      <Icon icon={Star} size="lg" />
    </div>
  ),
};

export const Labelled: Story = { args: { icon: Gauge, label: "Performance" } };

export const Set: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 16 }}>
      <Icon icon={Car} label="Vehicle" />
      <Icon icon={Gauge} label="Performance" />
      <Icon icon={ChevronRight} />
    </div>
  ),
};
