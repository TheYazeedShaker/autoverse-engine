import type { Meta, StoryObj } from "@storybook/react-vite";

// Smoke story that proves the scaffold: tokens load, fonts render, and the surface + dir/lang
// toolbars work. Text inherits the themed foreground so it passes a11y on both surfaces.
function Welcome() {
  return (
    <div style={{ maxWidth: "44ch", display: "grid", gap: "var(--av-space-16)" }}>
      <h1
        style={{
          fontSize: "var(--av-text-3xl)",
          fontWeight: 800,
          margin: 0,
          letterSpacing: "-0.01em",
        }}
      >
        Autoverse Design System
      </h1>
      <p style={{ fontSize: "var(--av-text-base)", lineHeight: 1.6, margin: 0 }}>
        Foundations and primitives — documented, themeable across the Mist and Gunmetal surfaces,
        and bilingual. Switch the toolbar to RTL · العربية to see the Cairo specimen.
      </p>
    </div>
  );
}

const meta = {
  title: "Foundations/Welcome",
  component: Welcome,
} satisfies Meta<typeof Welcome>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
