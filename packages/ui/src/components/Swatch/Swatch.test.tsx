import { render, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { Swatch } from "./Swatch";

// RTL auto-cleanup is off here, so scope every query to this render's `container` via within().
const onyxOption = { value: "onyx", optionName: "Midnight Onyx", color: "#08090A" };

describe("Swatch", () => {
  it("is a toggle button whose accessible name is the option label, unpressed by default", () => {
    const { container } = render(<Swatch {...onyxOption} />);
    const btn = within(container).getByRole("button", { name: "Midnight Onyx" });
    expect(btn.tagName).toBe("BUTTON");
    expect(btn).toHaveAttribute("aria-pressed", "false");
  });

  it("reflects the selected state via aria-pressed and the selection ring", () => {
    const { container } = render(<Swatch {...onyxOption} selected />);
    const btn = within(container).getByRole("button", { pressed: true });
    expect(btn).toHaveClass("ring-2", "ring-fg");
  });

  it("paints the option colour as an inline background (brand data, not a token)", () => {
    const { container } = render(<Swatch {...onyxOption} />);
    // jsdom normalises the hex to rgb.
    expect((container.firstChild as HTMLElement).style.backgroundColor).toBe("rgb(8, 9, 10)");
  });

  it("calls onSelect with the machine value when activated", () => {
    const onSelect = vi.fn();
    const { container } = render(<Swatch {...onyxOption} onSelect={onSelect} />);
    within(container).getByRole("button").click();
    expect(onSelect).toHaveBeenCalledWith("onyx");
  });

  it("is keyboard-operable — Enter and Space activate it", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const { container } = render(<Swatch {...onyxOption} onSelect={onSelect} />);
    within(container).getByRole("button").focus();
    await user.keyboard("{Enter}");
    await user.keyboard(" ");
    expect(onSelect).toHaveBeenCalledTimes(2);
    expect(onSelect).toHaveBeenLastCalledWith("onyx");
  });

  it("does not fire when disabled", () => {
    const onSelect = vi.fn();
    const { container } = render(<Swatch {...onyxOption} onSelect={onSelect} disabled />);
    const btn = within(container).getByRole("button");
    expect(btn).toBeDisabled();
    btn.click();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("maps the size prop", () => {
    const { container } = render(<Swatch {...onyxOption} size="lg" />);
    expect(container.firstChild).toHaveClass("h-10", "w-10");
  });

  it("forwards a ref to the button", () => {
    const ref = createRef<HTMLButtonElement>();
    render(<Swatch {...onyxOption} ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
  });

  it("has no axe violations, selected or not", async () => {
    const { container } = render(
      <div>
        <Swatch value="mist" optionName="Glacier White" color="#F4F7F5" />
        <Swatch value="onyx" optionName="Midnight Onyx" color="#08090A" selected />
      </div>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
