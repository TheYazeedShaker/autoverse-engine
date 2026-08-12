import type { Meta, StoryObj } from "@storybook/react-vite";
import { ArrowRight } from "lucide-react";
import { Button } from "../Button";
import { Heading, Text } from "../Text";
import { StatBlock } from "../StatBlock";
import { Card } from "./Card";

const meta = {
  title: "Surface/Card",
  component: Card,
  // `children` is required; render-based stories below override it, so this is a placeholder.
  args: { tone: "card", padding: "md", border: true, children: "Card" },
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

function CardBody() {
  return (
    <div className="flex max-w-sm flex-col gap-3">
      <Heading level={3}>Aurora GT</Heading>
      <Text size="sm">A grand tourer tuned for the long road — quiet, quick, composed.</Text>
      <div className="flex gap-6">
        <StatBlock value="3.2" unit="s" label="0–100 km/h" />
        <StatBlock value="520" unit="km" label="Range" />
      </div>
      <div className="flex gap-3 pt-1">
        <Button trailingIcon={ArrowRight}>Configure</Button>
        <Button variant="ghost">Details</Button>
      </div>
    </div>
  );
}

export const Default: Story = { render: (args) => <Card {...args}>{<CardBody />}</Card> };

// The payoff of the contextual-foreground system: the SAME content (a primary Button, StatBlocks, muted
// text) is dropped into each tone and inverts automatically — light-on-dark in the dark Card, dark-on-light
// in the light ones — with no per-tone props on the children. None is ever dark-on-dark.
export const Tones: Story = {
  render: () => (
    <div className="flex flex-wrap items-start gap-6">
      <Card tone="card">
        <CardBody />
      </Card>
      <Card tone="panel">
        <CardBody />
      </Card>
      <Card tone="dark">
        <CardBody />
      </Card>
    </div>
  ),
};

export const Borderless: Story = {
  args: { border: false, tone: "panel" },
  render: (args) => (
    <Card {...args}>
      <CardBody />
    </Card>
  ),
};

export const PaddingSizes: Story = {
  render: () => (
    <div className="flex flex-wrap items-start gap-6">
      {(["sm", "md", "lg"] as const).map((padding) => (
        <Card key={padding} padding={padding}>
          <Text size="sm">padding=&quot;{padding}&quot;</Text>
        </Card>
      ))}
    </div>
  ),
};
