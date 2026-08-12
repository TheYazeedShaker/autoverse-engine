import type { Meta, StoryObj } from "@storybook/react-vite";
import { Container } from "./Container";

const meta = {
  title: "Layout/Container",
  component: Container,
  // Full-bleed canvas so the centred max-width + the responsive gutter are actually visible.
  parameters: { layout: "fullscreen" },
  // `children` is required on the component; stories below override via `render`, so this is a placeholder.
  args: { width: "default", children: "Content" },
} satisfies Meta<typeof Container>;

export default meta;
type Story = StoryObj<typeof meta>;

// A tinted band fills the viewport; the Container inside shows where content is centred and padded.
function Band({ children }: { children: React.ReactNode }) {
  return <div className="bg-surface-panel py-8">{children}</div>;
}

export const Default: Story = {
  render: (args) => (
    <Band>
      <Container {...args}>
        <div className="bg-surface-card text-on-surface rounded-md p-6">
          <p className="text-lg font-semibold">Centred content</p>
          <p className="text-on-surface-muted text-sm">
            mx-auto · max-w-7xl · px-4 sm:px-6 lg:px-8 — resize the canvas to watch the gutter grow.
          </p>
        </div>
      </Container>
    </Band>
  ),
};

export const Widths: Story = {
  render: () => (
    <div className="grid gap-4">
      {(["narrow", "default", "full"] as const).map((width) => (
        <Band key={width}>
          <Container width={width}>
            <div className="bg-surface-card text-on-surface rounded-md p-4 text-center text-sm font-medium">
              width=&quot;{width}&quot;
            </div>
          </Container>
        </Band>
      ))}
    </div>
  ),
};

// On a dark surface the Container is unchanged — it owns layout only, so the foreground stays AA by
// inheritance from the surface it sits on.
export const OnDarkSurface: Story = {
  render: (args) => (
    <div className="bg-surface-dark text-on-dark py-8">
      <Container {...args}>
        <div className="border-border/40 rounded-md border p-6">
          <p className="text-lg font-semibold">Same Container, dark surface</p>
          <p className="text-on-dark-muted text-sm">Layout-only: no colour of its own.</p>
        </div>
      </Container>
    </div>
  ),
};

// Polymorphic: render as a semantic page region (here a reading column) rather than a bare div.
export const AsSemanticMain: Story = {
  render: () => (
    <Band>
      <Container as="main" width="narrow">
        <div className="bg-surface-card text-on-surface rounded-md p-6">
          <p className="text-on-surface-muted text-sm">
            as=&quot;main&quot; · width=&quot;narrow&quot; — a single reading column.
          </p>
        </div>
      </Container>
    </Band>
  ),
};
