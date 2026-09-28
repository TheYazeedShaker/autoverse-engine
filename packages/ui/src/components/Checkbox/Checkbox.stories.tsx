import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { Checkbox, type CheckboxProps } from "./Checkbox";

// A labelled yes/no (slice 7: the lead form's required consent), on Radix Checkbox. Long labels wrap
// beside the box. The consent wording here is a placeholder; the real text is data.

const meta = { title: "Forms/Checkbox" } satisfies Meta;
export default meta;
type Story = StoryObj;

function Demo(props: Partial<CheckboxProps>) {
  const [checked, setChecked] = useState(false);
  return (
    <div className="max-w-md">
      <Checkbox
        label="Placeholder consent wording: I agree that Demo Motors may contact me about this request."
        checked={checked}
        onCheckedChange={setChecked}
        required
        {...props}
      />
    </div>
  );
}

export const Default: Story = { render: () => <Demo /> };
export const WithError: Story = { render: () => <Demo error="Please agree to be contacted" /> };
export const Arabic: Story = {
  globals: { direction: "rtl" },
  render: () => (
    <Demo label="نص موافقة تجريبي: أوافق على أن تتواصل معي Demo Motors بخصوص هذا الطلب." />
  ),
};
