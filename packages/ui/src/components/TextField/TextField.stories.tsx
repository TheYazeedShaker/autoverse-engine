import type { Meta, StoryObj } from "@storybook/react-vite";
import { TextField } from "./TextField";

// A labelled single-line input (slice 7, the lead form): native input and label, hint and error
// tied by aria-describedby, tokens only.

const meta = {
  title: "Forms/TextField",
  component: TextField,
  args: { label: "Mobile number", hint: "e.g. 010 1234 5678", type: "tel" },
} satisfies Meta<typeof TextField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Required: Story = { args: { label: "Full name", hint: undefined, required: true } };
export const WithError: Story = { args: { error: "Enter an Egyptian mobile number" } };
export const Arabic: Story = {
  globals: { direction: "rtl" },
  args: { label: "الاسم الكامل", hint: "كما في الهوية", type: "text" },
};
