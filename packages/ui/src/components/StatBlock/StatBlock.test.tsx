import { render, within } from "@testing-library/react";
import { axe } from "jest-axe";
import { describe, expect, it } from "vitest";
import { StatBlock } from "./StatBlock";

// RTL auto-cleanup is off here, so scope every query to this render's `container` via within().
describe("StatBlock", () => {
  it("renders the value, unit and label", () => {
    const { container } = render(<StatBlock value="3.2" unit="s" label="0–100 km/h" />);
    const scoped = within(container);
    expect(scoped.getByText("3.2")).toBeInTheDocument();
    expect(scoped.getByText("s")).toBeInTheDocument();
    expect(scoped.getByText("0–100 km/h")).toBeInTheDocument();
  });

  it("accepts a numeric value", () => {
    const { container } = render(<StatBlock value={500} unit="km" label="Range" />);
    expect(within(container).getByText("500")).toBeInTheDocument();
  });

  it("omits the unit when not provided", () => {
    const { container } = render(<StatBlock value="AWD" label="Drivetrain" />);
    const scoped = within(container);
    expect(scoped.getByText("AWD")).toBeInTheDocument();
    expect(scoped.getByText("Drivetrain")).toBeInTheDocument();
    // the value carries no nested unit span when `unit` is absent
    expect(scoped.getByText("AWD").querySelector("span")).toBeNull();
  });

  it("renders the label with the muted contextual foreground", () => {
    const { container } = render(<StatBlock value="3.2" label="0–100 km/h" />);
    expect(within(container).getByText("0–100 km/h")).toHaveClass("text-fg-muted");
  });

  it("maps the size prop onto the value", () => {
    const { container } = render(<StatBlock value="3.2" label="x" size="lg" />);
    expect(within(container).getByText("3.2")).toHaveClass("text-4xl");
  });

  it("applies centre alignment when requested", () => {
    const { container } = render(<StatBlock value="3.2" label="x" align="center" />);
    expect(container.firstChild).toHaveClass("items-center", "text-center");
  });

  it("honours the polymorphic `as` prop", () => {
    const { container } = render(<StatBlock as="li" value="3.2" label="x" />);
    expect((container.firstChild as HTMLElement).tagName).toBe("LI");
  });

  it("sets no inline colour (uses the contextual fg utilities)", () => {
    const { container } = render(<StatBlock value="3.2" label="x" />);
    expect((container.firstChild as HTMLElement).style.color).toBe("");
  });

  it("has no axe violations", async () => {
    const { container } = render(<StatBlock value="3.2" unit="s" label="0–100 km/h" />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
