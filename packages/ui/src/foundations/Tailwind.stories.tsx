import type { Meta, StoryObj } from "@storybook/react-vite";

// Proves + documents the Tailwind layer: these utilities are generated from the design tokens
// (see src/styles/tailwind.css), so components style with `bg-surface-panel`, `text-on-surface`,
// `rounded-lg`, `font-sans`, etc. — never raw hex/px. Renders on both surface themes.
function TailwindCheck() {
  return (
    <div className="font-sans grid max-w-md gap-4">
      <div className="rounded-lg border border-border bg-surface-panel p-6 shadow-md">
        <p className="text-on-surface text-lg font-semibold">Tailwind is wired from tokens.</p>
        <p className="text-on-surface-muted text-sm">
          bg-surface-panel · text-on-surface · rounded-lg · border-border · shadow-md · p-6
        </p>
      </div>
      <div className="rounded-md bg-surface-dark text-on-dark p-6">
        <p className="text-lg font-semibold">Dark surface variant</p>
        <p className="text-on-dark-muted text-sm">
          bg-surface-dark · text-on-dark · text-on-dark-muted
        </p>
      </div>
    </div>
  );
}

const meta = {
  title: "Foundations/Tailwind",
  component: TailwindCheck,
} satisfies Meta<typeof TailwindCheck>;

export default meta;

export const Default: StoryObj<typeof meta> = {};
