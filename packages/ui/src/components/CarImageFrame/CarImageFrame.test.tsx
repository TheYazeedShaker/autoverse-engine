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
    expect(side.firstChild).toHaveClass("aspect-[2/1]");
    expect(sidePlaceholder.firstChild).toHaveClass("aspect-[2/1]");
    expect(hero.firstChild).toHaveClass("aspect-video");
  });

  it("fills the box with the image; the placeholder takes the same box", () => {
    const c = render(<CarImageFrame view="side" image={img} placeholderLabel="x" />).container;
    expect(within(c).getByRole("img").parentElement).toHaveClass("absolute", "inset-0");
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
