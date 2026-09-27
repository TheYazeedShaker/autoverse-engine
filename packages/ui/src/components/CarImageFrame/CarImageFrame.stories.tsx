import type { Meta, StoryObj } from "@storybook/react-vite";
import { CarFront } from "lucide-react";
import { Icon } from "../Icon";
import { CarImageFrame } from "./CarImageFrame";

// The fixed box every car is drawn in (ADR 0022). Stories use a Lucide glyph as a stand-in image: no real
// vehicle imagery in the repo. Switch the Direction toolbar to RTL to see the only mirroring allowed.

const standIn = (
  <div className="text-fg-muted grid h-full w-full place-items-end justify-center">
    <Icon icon={CarFront} size="lg" className="size-32" label="Stand-in vehicle image" />
  </div>
);

const meta: Meta<typeof CarImageFrame> = {
  title: "Showroom/CarImageFrame",
  component: CarImageFrame,
  args: { view: "side", image: standIn, placeholderLabel: "Image coming soon" },
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

export const Side: Story = {};
export const SidePlaceholder: Story = { args: { image: null } };
export const FrontThreeQuarter: Story = { args: { view: "front-34" } };
