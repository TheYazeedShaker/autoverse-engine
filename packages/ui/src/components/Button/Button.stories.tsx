import type { Meta, StoryObj } from "@storybook/react-vite";
import { ArrowRight, Car, Download } from "lucide-react";
import { Button } from "./Button";
import { Surface } from "../../surface";

const meta = {
  title: "Interactive/Button",
  component: Button,
  args: { children: "Configure", variant: "primary", size: "md" },
  argTypes: {
    variant: { control: "inline-radio", options: ["primary", "secondary", "ghost"] },
    size: { control: "inline-radio", options: ["sm", "md", "lg"] },
    leadingIcon: { control: false },
    trailingIcon: { control: false },
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Variants: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <Button variant="primary">Primary</Button>
      <Button variant="secondary">Secondary</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="accent">Accent (brand)</Button>
    </div>
  ),
};

export const Sizes: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <Button size="sm">Small</Button>
      <Button size="md">Medium</Button>
      <Button size="lg">Large</Button>
    </div>
  ),
};

export const WithIcons: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <Button leadingIcon={Car}>Build yours</Button>
      <Button variant="secondary" trailingIcon={ArrowRight}>
        Explore
      </Button>
      <Button variant="ghost" leadingIcon={Download}>
        Brochure
      </Button>
    </div>
  ),
};

export const States: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <Button>Default</Button>
      <Button disabled>Disabled</Button>
      <Button loading>Saving…</Button>
      <Button variant="secondary" loading>
        Loading
      </Button>
    </div>
  ),
};

// asChild: the button styling is applied to a real anchor, so links and buttons stay visually identical.
export const AsLink: Story = {
  render: () => (
    <Button asChild trailingIcon={ArrowRight}>
      <a href="https://auto-verse.net">Visit Autoverse</a>
    </Button>
  ),
};

// All three variants invert on the dark surface via the contextual fg/bg pair (which `Surface` publishes):
// primary becomes a light fill with dark text, secondary/ghost tint the light ink — none are dark-on-dark.
export const OnDarkSurface: Story = {
  render: () => (
    <Surface tone="dark">
      <div className="flex items-center gap-4">
        <Button variant="primary">Primary</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="ghost">Ghost</Button>
      </div>
    </Surface>
  ),
};
