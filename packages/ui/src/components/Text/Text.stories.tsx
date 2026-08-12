import type { Meta, StoryObj } from "@storybook/react-vite";
import { Heading } from "./Heading";
import { Text } from "./Text";

const meta = {
  title: "Primitives/Text",
  component: Text,
  args: { children: "Drive the experience" },
} satisfies Meta<typeof Text>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Sizes: Story = {
  render: () => (
    <div style={{ display: "grid", gap: 8 }}>
      <Text size="xl">Extra large — drive the experience</Text>
      <Text size="lg">Large — drive the experience</Text>
      <Text size="base">Base — drive the experience</Text>
      <Text size="sm">Small — drive the experience</Text>
      <Text size="xs">Extra small — drive the experience</Text>
    </div>
  ),
};

export const Headings: Story = {
  render: () => (
    <div style={{ display: "grid", gap: 12 }}>
      <Heading level={1}>Heading level 1</Heading>
      <Heading level={2}>Heading level 2</Heading>
      <Heading level={3}>Heading level 3</Heading>
      <Heading level={4}>Heading level 4</Heading>
    </div>
  ),
};

// Wrapping in lang="ar"/dir="rtl" switches the inherited family to Cairo and flips direction.
export const Arabic: Story = {
  render: () => (
    <div lang="ar" dir="rtl" style={{ display: "grid", gap: 8 }}>
      <Heading level={2}>أوتوفيرس</Heading>
      <Text size="lg">اكتشف سيارتك المثالية وصمّمها بالكامل.</Text>
    </div>
  ),
};
