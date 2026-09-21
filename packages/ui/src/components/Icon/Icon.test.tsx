import { render } from "@testing-library/react";
import { axe } from "jest-axe";
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
  // a11y: axe on a realistic composition, in both reading directions (Arabic is RTL).
  it.each(["ltr", "rtl"] as const)("has no axe violations (%s)", async (dir) => {
    const { container } = render(
      <div dir={dir} lang={dir === "rtl" ? "ar" : "en"}>
        <p>
          <Icon icon={Star} /> Rated <Icon icon={Star} label="Favorite" />
        </p>
      </div>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
