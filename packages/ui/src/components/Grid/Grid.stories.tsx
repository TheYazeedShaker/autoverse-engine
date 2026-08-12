import type { Meta, StoryObj } from "@storybook/react-vite";
import { Col } from "./Col";
import { Grid } from "./Grid";

const meta = {
  title: "Layout/Grid",
  component: Grid,
  parameters: { layout: "fullscreen" },
  args: { gap: "md", children: "cells" },
} satisfies Meta<typeof Grid>;

export default meta;
type Story = StoryObj<typeof meta>;

// A labelled cell so the column tracks are visible against the panel band.
function Cell({ label }: { label: string }) {
  return (
    <div className="bg-surface-card text-on-surface rounded-md p-4 text-center text-sm font-medium">
      {label}
    </div>
  );
}

// All 12 single-column cells — shows the underlying 12-track grid.
export const TwelveColumns: Story = {
  render: (args) => (
    <div className="bg-surface-panel p-6">
      <Grid {...args}>
        {Array.from({ length: 12 }, (_, i) => (
          <Col key={i} span={1}>
            <Cell label={`${i + 1}`} />
          </Col>
        ))}
      </Grid>
    </div>
  ),
};

// Mobile-first responsive: each card is full width on mobile, halves at md, thirds at lg.
// Resize the canvas to watch the columns reflow.
export const Responsive: Story = {
  render: () => (
    <div className="bg-surface-panel p-6">
      <Grid gap="md">
        {Array.from({ length: 6 }, (_, i) => (
          <Col key={i} span={12} md={6} lg={4}>
            <Cell label={`Card ${i + 1}`} />
          </Col>
        ))}
      </Grid>
    </div>
  ),
};

// A common page layout: a wide main column beside a sidebar (8 + 4), stacking on mobile.
export const SidebarLayout: Story = {
  render: () => (
    <div className="bg-surface-panel p-6">
      <Grid gap="lg">
        <Col span={12} lg={8}>
          <Cell label="Main — span 12, lg:8" />
        </Col>
        <Col span={12} lg={4}>
          <Cell label="Sidebar — span 12, lg:4" />
        </Col>
      </Grid>
    </div>
  ),
};

export const Gaps: Story = {
  render: () => (
    <div className="grid gap-6 bg-surface-panel p-6">
      {(["sm", "md", "lg"] as const).map((gap) => (
        <div key={gap}>
          <p className="text-on-surface-muted mb-2 text-xs">gap=&quot;{gap}&quot;</p>
          <Grid gap={gap}>
            {Array.from({ length: 4 }, (_, i) => (
              <Col key={i} span={3}>
                <Cell label="3" />
              </Col>
            ))}
          </Grid>
        </div>
      ))}
    </div>
  ),
};

// On a dark surface the grid is unchanged — layout-only, so the foreground stays AA by inheritance.
export const OnDarkSurface: Story = {
  render: () => (
    <div className="bg-surface-dark p-6">
      <Grid gap="md">
        {Array.from({ length: 3 }, (_, i) => (
          <Col key={i} span={12} md={4}>
            <div className="border-border/40 text-on-dark rounded-md border p-4 text-center text-sm font-medium">
              span 12, md:4
            </div>
          </Col>
        ))}
      </Grid>
    </div>
  ),
};
