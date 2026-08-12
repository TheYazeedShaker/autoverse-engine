import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Container } from "./Container";

// Queries are scoped to each render's `container` (RTL auto-cleanup is off in this package), so the
// assertions stay isolated. Container renders a single root element, so `container.firstChild` is it.
describe("Container", () => {
  it("renders a <div> by default, centred and full-width at the default max-width", () => {
    const { container } = render(<Container>content</Container>);
    const el = container.firstChild as HTMLElement;
    expect(el.tagName).toBe("DIV");
    expect(el).toHaveClass("mx-auto", "w-full", "max-w-7xl");
  });

  it("maps the width prop to the token max-width scale", () => {
    const narrow = render(<Container width="narrow">x</Container>);
    expect(narrow.container.firstChild).toHaveClass("max-w-3xl");
    const full = render(<Container width="full">x</Container>);
    expect(full.container.firstChild).toHaveClass("max-w-full");
  });

  it("carries the responsive horizontal gutter (16 → 24 → 32)", () => {
    const { container } = render(<Container>x</Container>);
    expect(container.firstChild).toHaveClass("px-4", "sm:px-6", "lg:px-8");
  });

  it("honours the polymorphic `as` prop for semantic regions", () => {
    const { container } = render(<Container as="main">x</Container>);
    expect((container.firstChild as HTMLElement).tagName).toBe("MAIN");
  });

  it("appends a passthrough className", () => {
    const { container } = render(<Container className="custom">x</Container>);
    expect(container.firstChild).toHaveClass("custom", "mx-auto", "max-w-7xl");
  });

  it("sets no inline colour or font (layout-only — inherits the surface foreground)", () => {
    const { container } = render(<Container>x</Container>);
    const { style } = container.firstChild as HTMLElement;
    expect(style.color).toBe("");
    expect(style.background).toBe("");
    expect(style.fontFamily).toBe("");
  });
});
