import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { ModelDock, type DockModel } from "./ModelDock";

// The floating model dock (spec §5.4): glassy pills, a sliding active pill (the `pillSlide` semantic
// motion; it jumps under reduced motion). On the page it shows only the visible models, hides below
// 2, and appears once the hero is scrolled past.

const MODELS: DockModel[] = [
  { id: "a", name: "Aurora GT", href: "#a" },
  { id: "v", name: "Vela", href: "#v" },
  { id: "n", name: "Nimbus", href: "#n" },
  { id: "s", name: "Stratos", href: "#s" },
];

const meta = {
  title: "Showroom/ModelDock",
  parameters: { layout: "padded" },
} satisfies Meta;

export default meta;
type Story = StoryObj;

function Demo({ models = MODELS }: { models?: DockModel[] }) {
  const [active, setActive] = useState(models[0]!.id);
  return (
    <div className="bg-surface-panel pt-6 pb-24">
      <ModelDock models={models} activeId={active} onPick={setActive} label="Models" shown />
    </div>
  );
}

export const Default: Story = { render: () => <Demo /> };

export const Arabic: Story = {
  globals: { direction: "rtl" },
  render: () => (
    <Demo
      models={[
        { id: "a", name: "أورورا جي تي", href: "#a" },
        { id: "v", name: "فيلا", href: "#v" },
        { id: "n", name: "نيمبس", href: "#n" },
      ]}
    />
  ),
};
