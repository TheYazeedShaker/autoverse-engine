import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { Select, type SelectProps } from "./Select";

// A labelled single choice (slice 7: the lead form's city and model), on Radix Select.

const meta = { title: "Forms/Select" } satisfies Meta;
export default meta;
type Story = StoryObj;

function Demo(props: Partial<SelectProps>) {
  const [value, setValue] = useState<string | undefined>(undefined);
  return (
    <div className="max-w-sm">
      <Select
        label="City"
        placeholder="Choose a city"
        options={[
          { value: "cairo", label: "Cairo" },
          { value: "giza", label: "Giza" },
          { value: "alexandria", label: "Alexandria" },
        ]}
        value={value}
        onValueChange={setValue}
        dir="ltr"
        required
        {...props}
      />
    </div>
  );
}

export const Default: Story = { render: () => <Demo /> };
export const WithError: Story = { render: () => <Demo error="Choose your city" /> };
export const Arabic: Story = {
  globals: { direction: "rtl" },
  render: () => (
    <Demo
      label="المدينة"
      placeholder="اختر المدينة"
      dir="rtl"
      options={[
        { value: "cairo", label: "القاهرة" },
        { value: "giza", label: "الجيزة" },
      ]}
    />
  ),
};
