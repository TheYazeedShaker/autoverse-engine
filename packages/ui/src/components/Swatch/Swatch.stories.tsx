import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { Surface } from "../../surface";
import { Swatch } from "./Swatch";

const meta = {
  title: "Interactive/Swatch",
  component: Swatch,
  args: { value: "onyx", optionName: "Midnight Onyx", color: "#08090A", size: "md" },
} satisfies Meta<typeof Swatch>;

export default meta;
type Story = StoryObj<typeof meta>;

// A small paint palette, the way a configurator option group would supply it (value = manifest key).
const PAINTS = [
  { value: "glacier", optionName: "Glacier White", color: "#F4F7F5" },
  { value: "onyx", optionName: "Midnight Onyx", color: "#08090A" },
  { value: "gunmetal", optionName: "Gunmetal", color: "#222823" },
  { value: "platinum", optionName: "Liquid Platinum", color: "#A7A2A9" },
  { value: "slate", optionName: "Slate", color: "#575A5E" },
];

export const Playground: Story = { args: { selected: false } };

// Single-select group (foreshadows SegmentedToggle): one Swatch pressed at a time, driven by `onSelect`.
function Palette() {
  const [picked, setPicked] = useState("onyx");
  return (
    <div className="flex items-center gap-3">
      {PAINTS.map((p) => (
        <Swatch key={p.value} {...p} selected={picked === p.value} onSelect={setPicked} />
      ))}
    </div>
  );
}

export const SelectableGroup: Story = { render: () => <Palette /> };

export const Sizes: Story = {
  render: () => (
    <div className="flex items-center gap-3">
      <Swatch value="onyx" optionName="Midnight Onyx" color="#08090A" size="sm" selected />
      <Swatch value="onyx" optionName="Midnight Onyx" color="#08090A" size="md" selected />
      <Swatch value="onyx" optionName="Midnight Onyx" color="#08090A" size="lg" selected />
    </div>
  ),
};

export const Disabled: Story = {
  args: { color: "#A7A2A9", optionName: "Liquid Platinum (unavailable)", disabled: true },
};

// On the dark surface the chip fill is unchanged (it's brand data), but the border + selection ring use the
// contextual --av-fg, so they stay visible — including the ring around the near-black Onyx chip.
export const OnDarkSurface: Story = {
  render: () => (
    <Surface tone="dark">
      <div className="flex items-center gap-3">
        {PAINTS.map((p) => (
          <Swatch key={p.value} {...p} selected={p.value === "onyx"} />
        ))}
      </div>
    </Surface>
  ),
};
