import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ModelDock, type DockModel } from "./ModelDock";

afterEach(cleanup);

const MODELS: DockModel[] = [
  { id: "a", name: "Aurora GT", href: "#aurora-gt" },
  { id: "v", name: "Vela", href: "#vela" },
  { id: "n", name: "Nimbus", href: "#nimbus" },
];

describe("ModelDock", () => {
  it("is a named navigation of in-page links; the active one is aria-current", () => {
    render(<ModelDock models={MODELS} activeId="v" onPick={() => {}} label="Models" shown />);
    const nav = screen.getByRole("navigation", { name: "Models" });
    const links = within(nav).getAllByRole("link");
    expect(links.map((l) => l.getAttribute("href"))).toEqual(["#aurora-gt", "#vela", "#nimbus"]);
    expect(within(nav).getByRole("link", { name: "Vela" })).toHaveAttribute("aria-current", "true");
    expect(within(nav).getByRole("link", { name: "Nimbus" })).not.toHaveAttribute("aria-current");
  });

  it("hands a pick to the app (which scrolls), instead of jumping to the anchor", async () => {
    const onPick = vi.fn();
    render(<ModelDock models={MODELS} activeId="a" onPick={onPick} label="Models" shown />);
    await userEvent.click(screen.getByRole("link", { name: "Nimbus" }));
    expect(onPick).toHaveBeenCalledWith("n");
  });

  it("draws the sliding pill only behind the active model", () => {
    const { rerender } = render(
      <ModelDock models={MODELS} activeId="a" onPick={() => {}} label="Models" shown />,
    );
    const pillHost = () =>
      [...document.querySelectorAll("li")].findIndex((li) => li.querySelector("span[aria-hidden]"));
    expect(pillHost()).toBe(0);
    rerender(<ModelDock models={MODELS} activeId="n" onPick={() => {}} label="Models" shown />);
    expect(pillHost()).toBe(2);
    rerender(<ModelDock models={MODELS} activeId={null} onPick={() => {}} label="Models" shown />);
    expect(pillHost()).toBe(-1);
  });

  it("hidden (before the hero is scrolled past) it is inert: out of the tab order", () => {
    render(
      <ModelDock models={MODELS} activeId="a" onPick={() => {}} label="Models" shown={false} />,
    );
    const wrap = document.querySelector("[data-shown]")!;
    expect(wrap).toHaveAttribute("data-shown", "false");
    expect(wrap).toHaveAttribute("inert");
    expect(wrap).toHaveClass("opacity-0");
  });

  it("has no axe violations, in both directions", async () => {
    const { container } = render(
      <ModelDock models={MODELS} activeId="a" onPick={() => {}} label="Models" shown />,
    );
    expect(await axe(container)).toHaveNoViolations();
    const rtl = render(
      <div dir="rtl" lang="ar">
        <ModelDock
          models={[
            { id: "a", name: "أورورا", href: "#a" },
            { id: "v", name: "فيلا", href: "#v" },
          ]}
          activeId="v"
          onPick={() => {}}
          label="الطرازات"
          shown
        />
      </div>,
    ).container;
    expect(await axe(rtl)).toHaveNoViolations();
  });
});
