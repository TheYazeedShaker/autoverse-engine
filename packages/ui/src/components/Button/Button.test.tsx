import { render, within } from "@testing-library/react";
import { axe } from "jest-axe";
import { ArrowRight, Star } from "lucide-react";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { Button } from "./Button";

// RTL auto-cleanup is off in this package, so the default queries (bound to document.body) would see
// buttons from earlier renders. Scope every query to this render's `container` via within().
describe("Button", () => {
  it("renders a <button> with the default primary/md variant (inverting fg/bg fill)", () => {
    const { container } = render(<Button>Go</Button>);
    const btn = within(container).getByRole("button", { name: "Go" });
    expect(btn.tagName).toBe("BUTTON");
    expect(btn).toHaveClass("bg-fg", "text-bg", "h-10");
  });

  it("maps variant and size props to utilities", () => {
    const { container } = render(
      <Button variant="secondary" size="lg">
        x
      </Button>,
    );
    const btn = within(container).getByRole("button");
    expect(btn).toHaveClass("border", "border-fg/30", "text-fg", "h-12", "text-lg");
  });

  it("renders leading and trailing icons (decorative)", () => {
    const { container } = render(
      <Button leadingIcon={Star} trailingIcon={ArrowRight}>
        Buy
      </Button>,
    );
    const svgs = container.querySelectorAll("svg");
    expect(svgs).toHaveLength(2);
    svgs.forEach((svg) => expect(svg).toHaveAttribute("aria-hidden", "true"));
  });

  it("when loading: disables, sets aria-busy, shows a spinner and hides the trailing icon", () => {
    const { container } = render(
      <Button loading trailingIcon={ArrowRight}>
        Saving
      </Button>,
    );
    const btn = within(container).getByRole("button");
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute("aria-busy", "true");
    expect(container.querySelector("svg.animate-spin")).toBeInTheDocument();
    expect(container.querySelectorAll("svg")).toHaveLength(1); // spinner only, trailing suppressed
  });

  it("does not set aria-busy when not loading", () => {
    const { container } = render(<Button>Idle</Button>);
    expect(within(container).getByRole("button")).not.toHaveAttribute("aria-busy");
  });

  it("honours the disabled attribute and blocks clicks", () => {
    const onClick = vi.fn();
    const { container } = render(
      <Button disabled onClick={onClick}>
        x
      </Button>,
    );
    const btn = within(container).getByRole("button");
    expect(btn).toBeDisabled();
    btn.click();
    expect(onClick).not.toHaveBeenCalled();
  });

  it("fires onClick when enabled", () => {
    const onClick = vi.fn();
    const { container } = render(<Button onClick={onClick}>x</Button>);
    within(container).getByRole("button").click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("renders as the child element via asChild, keeping the button classes", () => {
    const { container } = render(
      <Button asChild variant="ghost">
        <a href="/models">Browse</a>
      </Button>,
    );
    const scoped = within(container);
    const link = scoped.getByRole("link", { name: "Browse" });
    expect(link.tagName).toBe("A");
    expect(link).toHaveAttribute("href", "/models");
    expect(link).toHaveClass("inline-flex"); // button styling applied to the anchor
    expect(scoped.queryByRole("button")).toBeNull();
  });

  it("forwards a ref to the underlying button", () => {
    const ref = createRef<HTMLButtonElement>();
    render(<Button ref={ref}>x</Button>);
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
  });

  it("merges a conflicting className override via tailwind-merge", () => {
    const { container } = render(<Button className="rounded-xl">x</Button>);
    const btn = within(container).getByRole("button");
    expect(btn).toHaveClass("rounded-xl");
    expect(btn).not.toHaveClass("rounded-md"); // override wins, no duplicate radius
  });

  // a11y by construction (ADR-0004). jsdom axe checks role/name/aria here; colour-contrast is covered by
  // the token invariant tests + the Storybook axe gate. Covers the labelled, icon, and loading variants.
  it("has no axe violations across variants", async () => {
    const { container } = render(
      <div>
        <Button variant="primary">Configure</Button>
        <Button variant="secondary" leadingIcon={Star}>
          Explore
        </Button>
        <Button variant="ghost" loading>
          Saving
        </Button>
        <Button disabled>Unavailable</Button>
      </div>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
