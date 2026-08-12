import { render, within } from "@testing-library/react";
import { axe } from "jest-axe";
import { describe, expect, it } from "vitest";
import { Card } from "./Card";

// RTL auto-cleanup is off here, so scope queries to this render's `container`.
describe("Card", () => {
  it("renders its children", () => {
    const { container } = render(<Card>Inside</Card>);
    expect(within(container).getByText("Inside")).toBeInTheDocument();
  });

  it("defaults to the card tone, publishing its contextual pair and background", () => {
    const { container } = render(<Card>x</Card>);
    const el = container.firstChild as HTMLElement;
    expect(el.style.background).toBe("var(--av-surface-card)");
    expect(el.style.color).toBe("var(--av-on-card)");
    expect(el.style.getPropertyValue("--av-fg")).toBe("var(--av-on-card)");
    expect(el.style.getPropertyValue("--av-fg-muted")).toBe("var(--av-on-card-muted)");
    expect(el.style.getPropertyValue("--av-bg")).toBe("var(--av-surface-card)");
  });

  it("publishes the dark contextual pair for the dark tone (its own foreground, §4.2)", () => {
    const { container } = render(<Card tone="dark">x</Card>);
    const el = container.firstChild as HTMLElement;
    expect(el.style.background).toBe("var(--av-surface-dark)");
    expect(el.style.getPropertyValue("--av-fg")).toBe("var(--av-on-dark)");
    expect(el.style.getPropertyValue("--av-bg")).toBe("var(--av-surface-dark)");
  });

  it("shows the hairline border by default and omits it when border={false}", () => {
    const withBorder = render(<Card>x</Card>);
    expect(withBorder.container.firstChild).toHaveClass("border", "border-fg/10");
    const noBorder = render(<Card border={false}>x</Card>);
    expect(noBorder.container.firstChild).not.toHaveClass("border-fg/10");
  });

  it("maps the padding prop", () => {
    const lg = render(<Card padding="lg">x</Card>);
    expect(lg.container.firstChild).toHaveClass("p-8");
    const none = render(<Card padding="none">x</Card>);
    expect(none.container.firstChild).not.toHaveClass("p-6");
  });

  it("honours the polymorphic `as` prop", () => {
    const { container } = render(<Card as="article">x</Card>);
    expect((container.firstChild as HTMLElement).tagName).toBe("ARTICLE");
  });

  it("has no axe violations", async () => {
    const { container } = render(
      <Card tone="dark">
        <h2>Performance</h2>
        <p>Track-tuned.</p>
      </Card>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
