import { render, within } from "@testing-library/react";
import { axe } from "jest-axe";
import { describe, expect, it } from "vitest";
import { CarImageFrame } from "./CarImageFrame";

const img = <img src="/car.png" alt="Aurora GT, side view" />;

describe("CarImageFrame", () => {
  it("gives each view one fixed aspect ratio, image or not (the layout never jumps)", () => {
    const side = render(<CarImageFrame view="side" image={img} placeholderLabel="x" />).container;
    const sidePlaceholder = render(
      <CarImageFrame view="side" image={null} placeholderLabel="x" />,
    ).container;
    const hero = render(
      <CarImageFrame view="front-34" image={img} placeholderLabel="x" />,
    ).container;
    expect(side.firstChild).toHaveClass("aspect-(--av-car-aspect-side)");
    expect(sidePlaceholder.firstChild).toHaveClass("aspect-(--av-car-aspect-side)");
    expect(hero.firstChild).toHaveClass("aspect-video");
  });

  it("side: the box has the masters' shape (token) and the car fills its token share of the width, centred", () => {
    const c = render(<CarImageFrame view="side" image={img} placeholderLabel="x" />).container;
    const layer = within(c).getByRole("img").parentElement;
    // Width from the token (--av-car-fill-side), never a literal; centred; top-to-bottom of the box.
    expect(layer).toHaveClass(
      "absolute",
      "inset-y-0",
      "inset-x-0",
      "mx-auto",
      "w-(--av-car-fill-side)",
    );
    expect(layer!.className).not.toMatch(/w-\[?\d/);
  });

  it("front-34 (hero): the car fills the hero token's share, centred, bottom-aligned", () => {
    const c = render(<CarImageFrame view="front-34" image={img} placeholderLabel="x" />).container;
    const layer = within(c).getByRole("img").parentElement;
    expect(layer).toHaveClass("absolute", "inset-y-0", "mx-auto", "w-(--av-car-fill-hero)");
    expect(layer!.className).not.toContain("--av-car-fill-side");
  });

  it("the placeholder takes the same box", () => {
    const p = render(
      <CarImageFrame view="side" image={null} placeholderLabel="Image coming soon" />,
    ).container;
    expect(within(p).getByRole("img", { name: "Image coming soon" })).toHaveClass(
      "absolute",
      "inset-0",
    );
  });

  it("mirrors only in RTL; the placeholder is counter-mirrored so it stays readable", () => {
    const c = render(<CarImageFrame view="side" image={null} placeholderLabel="x" />).container;
    const frame = c.firstChild as HTMLElement;
    expect(frame.className.split(/\s+/).filter((k) => k.includes("scale-x"))).toEqual([
      "rtl:-scale-x-100",
    ]);
    expect(c.querySelector("[data-placeholder]")).toHaveClass("rtl:-scale-x-100");
  });

  it("has no axe violations, in both directions", async () => {
    expect(
      await axe(render(<CarImageFrame view="side" image={img} placeholderLabel="x" />).container),
    ).toHaveNoViolations();
    const rtl = render(
      <div dir="rtl" lang="ar">
        <CarImageFrame view="side" image={null} placeholderLabel="الصورة قريبًا" />
      </div>,
    ).container;
    expect(await axe(rtl)).toHaveNoViolations();
  });
});
