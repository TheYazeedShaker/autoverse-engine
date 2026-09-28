import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { Button } from "../Button";
import { CONTENT_AR, CONTENT_EN } from "./fixtures";
import { SpecDrawer, type SpecDrawerProps } from "./SpecDrawer";

// One trim's technical data (spec §5.8): a side panel from the inline end (full height on phones),
// tabs → collapsible groups → rows from the spec ledger resolved for the trim, group notes, and
// Configure at the bottom (disabled until the configurator exists).

const meta = {
  title: "Showroom/SpecDrawer",
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;
type Story = StoryObj;

function Demo({ content }: { content: Omit<SpecDrawerProps, "open" | "onOpenChange"> }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="bg-surface-panel min-h-[40rem] p-6">
      <Button onClick={() => setOpen(true)}>Technical data</Button>
      <SpecDrawer {...content} open={open} onOpenChange={setOpen} />
    </div>
  );
}

export const Default: Story = { render: () => <Demo content={CONTENT_EN} /> };

/** No ledger yet: the pending note instead of tabs. */
export const NoData: Story = { render: () => <Demo content={{ ...CONTENT_EN, tabs: [] }} /> };

export const Arabic: Story = {
  globals: { direction: "rtl" },
  render: () => <Demo content={CONTENT_AR} />,
};
