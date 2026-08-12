import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Text } from "./Text";
import { Heading } from "./Heading";

describe("Text", () => {
  it("renders a <p> by default with the size token", () => {
    const { getByText } = render(<Text>Drive</Text>);
    const el = getByText("Drive");
    expect(el.tagName).toBe("P");
    expect(el).toHaveStyle({ fontSize: "var(--av-text-base)" });
  });

  it("honours the polymorphic `as` prop", () => {
    const { getByText } = render(
      <Text as="span" size="sm">
        Inline
      </Text>,
    );
    expect(getByText("Inline").tagName).toBe("SPAN");
  });

  it("does not set font-family (so lang-based font switching is inherited)", () => {
    const { getByText } = render(<Text>X</Text>);
    expect(getByText("X").style.fontFamily).toBe("");
  });
});

describe("Heading", () => {
  it("renders the semantic level as an h1–h4", () => {
    const { getByRole } = render(<Heading level={1}>Title</Heading>);
    const h = getByRole("heading", { level: 1, name: "Title" });
    expect(h.tagName).toBe("H1");
  });

  it("defaults to level 2", () => {
    const { getByRole } = render(<Heading>Section</Heading>);
    expect(getByRole("heading", { level: 2 })).toBeInTheDocument();
  });

  it("can override visual size independent of level", () => {
    const { getByRole } = render(
      <Heading level={3} size="4xl">
        Big
      </Heading>,
    );
    expect(getByRole("heading", { level: 3 })).toHaveStyle({ fontSize: "var(--av-text-4xl)" });
  });
});
