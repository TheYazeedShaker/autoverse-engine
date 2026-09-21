import { render } from "@testing-library/react";
import { axe } from "jest-axe";
import { describe, expect, it } from "vitest";
import { Grid } from "./Grid";
import { Col } from "./Col";

// Queries are scoped to each render's `container` (RTL auto-cleanup is off in this package). Grid and Col
// each render a single root element, so `container.firstChild` is it.
describe("Grid", () => {
  it("renders a 12-column grid with the default gap", () => {
    const { container } = render(<Grid>cells</Grid>);
    const el = container.firstChild as HTMLElement;
    expect(el.tagName).toBe("DIV");
    expect(el).toHaveClass("grid", "grid-cols-12", "gap-6");
  });

  it("maps the gap prop to the spacing scale", () => {
    const sm = render(<Grid gap="sm">x</Grid>);
    expect(sm.container.firstChild).toHaveClass("gap-4");
    const lg = render(<Grid gap="lg">x</Grid>);
    expect(lg.container.firstChild).toHaveClass("gap-8");
  });

  it("honours the polymorphic `as` prop", () => {
    const { container } = render(<Grid as="section">x</Grid>);
    expect((container.firstChild as HTMLElement).tagName).toBe("SECTION");
  });

  it("appends a passthrough className", () => {
    const { container } = render(<Grid className="custom">x</Grid>);
    expect(container.firstChild).toHaveClass("custom", "grid", "grid-cols-12");
  });
});

describe("Col", () => {
  it("spans the full row (12) by default", () => {
    const { container } = render(<Col>x</Col>);
    expect(container.firstChild).toHaveClass("col-span-12");
  });

  it("maps the base span prop", () => {
    const { container } = render(<Col span={4}>x</Col>);
    expect(container.firstChild).toHaveClass("col-span-4");
  });

  it("emits a responsive span class per provided breakpoint", () => {
    const { container } = render(
      <Col span={12} md={6} lg={4}>
        x
      </Col>,
    );
    const el = container.firstChild as HTMLElement;
    expect(el).toHaveClass("col-span-12", "md:col-span-6", "lg:col-span-4");
  });

  it("omits breakpoints that are not set", () => {
    const { container } = render(<Col span={6}>x</Col>);
    expect((container.firstChild as HTMLElement).className).not.toMatch(/(sm|md|lg|xl):col-span/);
  });

  it("honours the polymorphic `as` prop and sets no inline colour (layout-only)", () => {
    const { container } = render(
      <Col as="article" span={3}>
        x
      </Col>,
    );
    const el = container.firstChild as HTMLElement;
    expect(el.tagName).toBe("ARTICLE");
    expect(el.style.color).toBe("");
    expect(el.style.background).toBe("");
  });
  // a11y: axe on a realistic composition, in both reading directions (Arabic is RTL).
  it.each(["ltr", "rtl"] as const)("has no axe violations (%s)", async (dir) => {
    const { container } = render(
      <div dir={dir} lang={dir === "rtl" ? "ar" : "en"}>
        <Grid as="section" aria-label="Specifications">
          <Col span={12} md={6}>
            <p>Range</p>
          </Col>
          <Col span={12} md={6}>
            <p>Power</p>
          </Col>
        </Grid>
      </div>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
