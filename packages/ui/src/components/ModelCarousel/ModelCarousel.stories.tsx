import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { HERO_MODELS, LABELS_AR, LABELS_EN, formatAr, formatEn } from "./fixtures";
import { ModelCarousel, type HeroModel } from "./ModelCarousel";

// The showroom hero (spec §5.3): Embla carousel (1:1 drag, one model per flick, ~4% neighbour peek
// on desktop, RTL mirrored), model names, the trim pill, count-up stats, Configure + Show trims.
// Every car sits in the same 16:9 frame at the hero fill token (80%); the stories use placeholders
// (no real imagery in the repo).

const meta = {
  title: "Showroom/ModelCarousel",
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;
type Story = StoryObj;

function Demo({
  models = HERO_MODELS,
  dir = "ltr",
}: {
  models?: HeroModel[];
  dir?: "ltr" | "rtl";
}) {
  const [active, setActive] = useState(models[0]!.id);
  return (
    <ModelCarousel
      models={models}
      activeId={active}
      onActiveChange={setActive}
      onShowTrims={() => {}}
      dir={dir}
      labels={dir === "rtl" ? LABELS_AR : LABELS_EN}
      formatNumber={dir === "rtl" ? formatAr : formatEn}
      className="h-[45rem]"
    />
  );
}

export const Default: Story = { render: () => <Demo /> };

/** Sparse rule: one model is a static hero (no drag, no arrows, no name row). */
export const OneModel: Story = { render: () => <Demo models={[HERO_MODELS[1]!]} /> };

export const Arabic: Story = {
  globals: { direction: "rtl" },
  render: () => (
    <Demo
      dir="rtl"
      models={HERO_MODELS.map((m, i) => ({ ...m, name: ["أورورا جي تي", "فيلا", "نيمبس"][i]! }))}
    />
  ),
};
