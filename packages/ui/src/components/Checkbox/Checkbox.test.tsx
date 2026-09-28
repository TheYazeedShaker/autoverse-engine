import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { Checkbox } from "./Checkbox";

afterEach(cleanup);

function Harness({ error }: { error?: string }) {
  const [checked, setChecked] = useState(false);
  return (
    <Checkbox
      label="I agree that Demo Motors may contact me about this request."
      checked={checked}
      onCheckedChange={setChecked}
      error={error}
      required
    />
  );
}

describe("Checkbox", () => {
  it("is a checkbox named by its label; the box and the text both toggle it", async () => {
    render(<Harness />);
    const box = screen.getByRole("checkbox", { name: /I agree/ });
    expect(box).toHaveAttribute("aria-checked", "false");
    await userEvent.click(box);
    expect(box).toHaveAttribute("aria-checked", "true");
    await userEvent.click(screen.getByText(/I agree/));
    expect(box).toHaveAttribute("aria-checked", "false");
  });

  it("toggles with Space", async () => {
    render(<Harness />);
    const box = screen.getByRole("checkbox");
    box.focus();
    await userEvent.keyboard(" ");
    expect(box).toHaveAttribute("aria-checked", "true");
  });

  it("marks an error invalid and describes it", () => {
    render(<Harness error="Please agree to be contacted" />);
    const box = screen.getByRole("checkbox");
    expect(box).toHaveAttribute("aria-invalid", "true");
    expect(box).toHaveAccessibleDescription("Please agree to be contacted");
  });

  it("has no axe violations, LTR and RTL", async () => {
    const { container } = render(<Harness error="Please agree to be contacted" />);
    expect(await axe(container)).toHaveNoViolations();
    cleanup();
    const rtl = render(
      <div dir="rtl" lang="ar">
        <Checkbox label="أوافق على التواصل معي" checked={false} onCheckedChange={() => {}} />
      </div>,
    );
    expect(await axe(rtl.container)).toHaveNoViolations();
  });
});
