import { render } from "@testing-library/react";
import { Star } from "lucide-react";
import { describe, expect, it } from "vitest";
import { Icon } from "./Icon";

describe("Icon", () => {
  it("is decorative (aria-hidden, no role) by default", () => {
    const { container } = render(<Icon icon={Star} />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).not.toHaveAttribute("role");
  });

  it("exposes an accessible name when labelled", () => {
    const { getByRole } = render(<Icon icon={Star} label="Favorite" />);
    const svg = getByRole("img", { name: "Favorite" });
    expect(svg).toBeInTheDocument();
    expect(svg).not.toHaveAttribute("aria-hidden");
  });

  it("maps the size token to pixels", () => {
    const { container } = render(<Icon icon={Star} size="lg" />);
    expect(container.querySelector("svg")).toHaveAttribute("width", "24");
  });

  it("strokes with currentColor so it inherits the themed foreground", () => {
    const { container } = render(<Icon icon={Star} />);
    expect(container.querySelector("svg")).toHaveAttribute("stroke", "currentColor");
  });
});
