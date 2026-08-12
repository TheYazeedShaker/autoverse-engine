import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { Surface } from "../../surface";
import { SegmentedToggle } from "./SegmentedToggle";

const MODES = [
  { value: "comfort", label: "Comfort" },
  { value: "sport", label: "Sport" },
  { value: "track", label: "Track" },
];

const meta = {
  title: "Interactive/SegmentedToggle",
  component: SegmentedToggle,
  args: { options: MODES, label: "Drive mode", defaultValue: "comfort", size: "md" },
} satisfies Meta<typeof SegmentedToggle>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

// Controlled: the selected value drives an external label — the common configurator usage.
function Controlled() {
  const [mode, setMode] = useState("sport");
  return (
    <div className="flex flex-col items-start gap-3">
      <SegmentedToggle options={MODES} label="Drive mode" value={mode} onValueChange={setMode} />
      <p className="text-on-surface-muted text-sm">
        Selected: <span className="text-on-surface font-medium">{mode}</span>
      </p>
    </div>
  );
}

export const ControlledValue: Story = { render: () => <Controlled /> };

export const Sizes: Story = {
  render: () => (
    <div className="flex flex-col items-start gap-3">
      <SegmentedToggle options={MODES} label="Drive mode (sm)" defaultValue="comfort" size="sm" />
      <SegmentedToggle options={MODES} label="Drive mode (md)" defaultValue="comfort" size="md" />
    </div>
  ),
};

export const WithDisabledOption: Story = {
  args: {
    label: "Drive mode",
    defaultValue: "comfort",
    options: [...MODES, { value: "drift", label: "Drift", disabled: true }],
  },
};

// On the dark surface the whole control inverts via the contextual fg/bg pair: the track + idle labels use
// the light ink, and the selected segment becomes a light fill with dark text — AA throughout.
export const OnDarkSurface: Story = {
  render: () => (
    <Surface tone="dark">
      <SegmentedToggle options={MODES} label="Drive mode" defaultValue="sport" />
    </Surface>
  ),
};
