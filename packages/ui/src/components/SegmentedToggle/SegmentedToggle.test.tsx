import { render, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { describe, expect, it, vi } from "vitest";
import { SegmentedToggle } from "./SegmentedToggle";

const MODES = [
  { value: "comfort", label: "Comfort" },
  { value: "sport", label: "Sport" },
  { value: "track", label: "Track" },
];

// RTL auto-cleanup is off here, so scope every query to this render's `container` via within().
describe("SegmentedToggle", () => {
  it("renders a labelled radiogroup with one radio per option", () => {
    const { container } = render(<SegmentedToggle options={MODES} label="Drive mode" />);
    const scoped = within(container);
    expect(scoped.getByRole("radiogroup", { name: "Drive mode" })).toBeInTheDocument();
    expect(scoped.getAllByRole("radio")).toHaveLength(3);
    expect(scoped.getByRole("radio", { name: "Sport" })).toBeInTheDocument();
  });

  it("marks the selected value as checked (radio semantics)", () => {
    const { container } = render(
      <SegmentedToggle options={MODES} label="Drive mode" value="sport" />,
    );
    const scoped = within(container);
    expect(scoped.getByRole("radio", { name: "Sport" })).toBeChecked();
    expect(scoped.getByRole("radio", { name: "Comfort" })).not.toBeChecked();
  });

  it("calls onValueChange when a segment is clicked", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    const { container } = render(
      <SegmentedToggle options={MODES} label="Drive mode" onValueChange={onValueChange} />,
    );
    await user.click(within(container).getByRole("radio", { name: "Track" }));
    expect(onValueChange).toHaveBeenCalledWith("track");
  });

  it("is keyboard-operable — Space selects the focused segment", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    const { container } = render(
      <SegmentedToggle options={MODES} label="Drive mode" onValueChange={onValueChange} />,
    );
    // Space-to-select is our keyboard contract; arrow-key roving focus is Radix's (exercised in Storybook).
    within(container).getByRole("radio", { name: "Sport" }).focus();
    await user.keyboard(" ");
    expect(onValueChange).toHaveBeenCalledWith("sport");
  });

  it("does not select a disabled option", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    const options = [...MODES, { value: "drift", label: "Drift", disabled: true }];
    const { container } = render(
      <SegmentedToggle options={options} label="Drive mode" onValueChange={onValueChange} />,
    );
    const drift = within(container).getByRole("radio", { name: "Drift" });
    expect(drift).toBeDisabled();
    await user.click(drift);
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it("maps the size prop onto the segments", () => {
    const { container } = render(<SegmentedToggle options={MODES} label="Drive mode" size="sm" />);
    expect(within(container).getByRole("radio", { name: "Comfort" })).toHaveClass("text-sm");
  });

  it("has no axe violations (including a disabled option)", async () => {
    const { container } = render(
      <SegmentedToggle
        options={[...MODES, { value: "drift", label: "Drift", disabled: true }]}
        label="Drive mode"
        defaultValue="comfort"
      />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
