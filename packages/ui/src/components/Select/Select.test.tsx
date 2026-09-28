import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { Select, type SelectProps } from "./Select";

afterEach(cleanup);

const CITIES = [
  { value: "cairo", label: "Cairo" },
  { value: "giza", label: "Giza" },
];

function Harness(props: Partial<SelectProps>) {
  const [value, setValue] = useState<string | undefined>(undefined);
  return (
    <Select
      label="City"
      options={CITIES}
      value={value}
      onValueChange={setValue}
      placeholder="Choose a city"
      dir="ltr"
      {...props}
    />
  );
}

describe("Select", () => {
  it("is a labelled combobox showing its placeholder", () => {
    render(<Harness required />);
    const trigger = screen.getByRole("combobox", { name: /City/ });
    expect(trigger).toHaveTextContent("Choose a city");
    expect(trigger).toHaveAttribute("aria-required", "true");
  });

  it("opens a listbox and picks an option", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("combobox", { name: "City" }));
    await userEvent.click(await screen.findByRole("option", { name: "Giza" }));
    expect(screen.getByRole("combobox", { name: "City" })).toHaveTextContent("Giza");
  });

  it("marks an error invalid and describes it", () => {
    render(<Harness error="Choose your city" />);
    const trigger = screen.getByRole("combobox", { name: "City" });
    expect(trigger).toHaveAttribute("aria-invalid", "true");
    expect(trigger).toHaveAccessibleDescription("Choose your city");
  });

  it("has no axe violations, LTR and RTL", async () => {
    const { container } = render(<Harness hint="Where you'd like the test drive" />);
    expect(await axe(container)).toHaveNoViolations();
    cleanup();
    const rtl = render(
      <div dir="rtl" lang="ar">
        <Harness label="المدينة" placeholder="اختر المدينة" dir="rtl" />
      </div>,
    );
    expect(await axe(rtl.container)).toHaveNoViolations();
  });
});
