import type { Meta, StoryObj } from "@storybook/react-vite";
import { FilterSheet } from "./FilterSheet";
import { FilterSidebar } from "./FilterSidebar";
import { GROUPS_AR, GROUPS_EN, LABELS_AR, LABELS_EN, SORT_EN, useFilterState } from "./fixtures";

// The showroom's filters (spec §5.5): search, sort (featured · name · power · 0–100) and the facet
// groups body · fuel · drive · seats, with counts from the data. The desktop sidebar is sticky and
// glassy; below `lg` the same panel opens in a bottom sheet. Selected chips are the brand accent
// (theming REV); the stories show the neutral default accent.

const meta = {
  title: "Showroom/Filters",
  parameters: { layout: "padded", backgrounds: { default: "panel" } },
} satisfies Meta;

export default meta;
type Story = StoryObj;

function SidebarDemo({ initial }: { initial?: Record<string, string[]> }) {
  const state = useFilterState(initial);
  return (
    <div className="bg-surface-panel p-6">
      <FilterSidebar labels={LABELS_EN} groups={GROUPS_EN} sortOptions={SORT_EN} {...state} />
    </div>
  );
}

export const Sidebar: Story = { render: () => <SidebarDemo /> };

/** Two options on: Clear all appears, and each group shows how many of its options are on. */
export const SidebarWithSelection: Story = {
  render: () => <SidebarDemo initial={{ body: ["suv"], fuel: ["ev"] }} />,
};

function SheetDemo() {
  const state = useFilterState();
  const active = Object.values(state.selected).reduce((n, v) => n + v.length, 0);
  return (
    <div className="bg-surface-panel p-6">
      <FilterSheet
        triggerLabel={active ? `Filters · ${active}` : "Filters"}
        doneLabel="Show 4 models"
        status="4 of 5 models"
        labels={LABELS_EN}
        groups={GROUPS_EN}
        sortOptions={[
          { value: "featured", label: "Sort · Featured" },
          { value: "name", label: "Sort · Name A–Z" },
          { value: "power", label: "Sort · Power" },
          { value: "accel", label: "Sort · 0–100" },
        ]}
        {...state}
      />
    </div>
  );
}

/** Mobile: the trigger opens the bottom sheet; "Show N models" closes it. */
export const MobileSheet: Story = {
  parameters: { viewport: { defaultViewport: "mobile1" } },
  render: () => <SheetDemo />,
};

function ArabicDemo() {
  const state = useFilterState({ body: ["suv"] });
  return (
    <div className="bg-surface-panel p-6">
      <FilterSidebar
        labels={LABELS_AR}
        groups={GROUPS_AR}
        sortOptions={[
          { value: "featured", label: "المميز" },
          { value: "name", label: "الاسم أ–ي" },
        ]}
        {...state}
      />
    </div>
  );
}

export const Arabic: Story = {
  globals: { direction: "rtl" },
  render: () => <ArabicDemo />,
};
