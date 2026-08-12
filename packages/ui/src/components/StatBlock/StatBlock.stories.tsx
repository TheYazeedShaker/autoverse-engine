import type { Meta, StoryObj } from "@storybook/react-vite";
import { Surface } from "../../surface";
import { StatBlock } from "./StatBlock";

const meta = {
  title: "Display/StatBlock",
  component: StatBlock,
  args: { value: "3.2", unit: "s", label: "0–100 km/h", size: "md", align: "start" },
} satisfies Meta<typeof StatBlock>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Sizes: Story = {
  render: () => (
    <div className="flex items-end gap-12">
      <StatBlock value="3.2" unit="s" label="0–100 km/h" size="md" />
      <StatBlock value="3.2" unit="s" label="0–100 km/h" size="lg" />
    </div>
  ),
};

// The spec ribbon: a row of stats. Designed for the dark surface — value uses the contextual fg, label the
// muted fg, both AA on gunmetal. (Wrapped in Surface so the contextual pair is the dark one.)
export const SpecRibbonOnDark: Story = {
  render: () => (
    <Surface tone="dark">
      <div className="flex flex-wrap gap-x-12 gap-y-6">
        <StatBlock value="3.2" unit="s" label="0–100 km/h" />
        <StatBlock value="510" unit="hp" label="Power" />
        <StatBlock value="520" unit="km" label="Range (WLTP)" />
        <StatBlock value="250" unit="km/h" label="Top speed" />
      </div>
    </Surface>
  ),
};

// The same ribbon on the light surface — the contextual fg/muted-fg keep it AA without any change.
export const SpecRibbonOnLight: Story = {
  render: () => (
    <div className="flex flex-wrap gap-x-12 gap-y-6">
      <StatBlock value="3.2" unit="s" label="0–100 km/h" />
      <StatBlock value="510" unit="hp" label="Power" />
      <StatBlock value="520" unit="km" label="Range (WLTP)" />
    </div>
  ),
};

export const Centered: Story = { args: { align: "center", size: "lg" } };

export const NoUnit: Story = { args: { value: "AWD", unit: undefined, label: "Drivetrain" } };
