import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { CONTENT_AR, CONTENT_EN } from "./fixtures";
import { SpecDrawer, type SpecDrawerProps } from "./SpecDrawer";

afterEach(cleanup);

type Content = Omit<SpecDrawerProps, "open" | "onOpenChange">;

function Harness({ content = CONTENT_EN }: { content?: Content }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Technical data
      </button>
      <SpecDrawer {...content} open={open} onOpenChange={setOpen} />
    </>
  );
}

const openDrawer = async (content?: Content) => {
  render(<Harness content={content} />);
  await userEvent.click(screen.getByRole("button", { name: "Technical data" }));
  return screen.getByRole("dialog");
};

describe("SpecDrawer", () => {
  it("is a titled modal dialog naming the model, trim, year and price", async () => {
    const dialog = await openDrawer();
    expect(dialog).toHaveAccessibleName("Model details");
    expect(within(dialog).getByRole("heading", { name: "Aurora GT" })).toBeInTheDocument();
    expect(within(dialog).getByText("Long Range")).toBeInTheDocument();
    expect(within(dialog).getByText("2026 · Demo Motors")).toBeInTheDocument();
    expect(within(dialog).getByText("From EGP 3,900,000")).toBeInTheDocument();
    // The car sits in the side-view frame (the same box as the cards).
    expect(dialog.querySelector('[data-car-frame="side"]')).not.toBeNull();
  });

  it("shows tabs; the first is active with its first group open", async () => {
    const dialog = await openDrawer();
    const tabs = within(dialog).getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(["Technical data", "Standard equipment"]);
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    const perf = within(dialog).getByRole("button", { name: "Performance" });
    expect(perf).toHaveAttribute("aria-expanded", "true");
    expect(within(dialog).getByText("500 hp")).toBeInTheDocument();
    // Other groups start closed; opening one shows its note.
    const sound = within(dialog).getByRole("button", { name: "Sound level" });
    expect(sound).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(sound);
    expect(within(dialog).getByText(/Data will be added/)).toBeInTheDocument();
  });

  it("switches tabs (click, and arrow keys)", async () => {
    const dialog = await openDrawer();
    await userEvent.click(within(dialog).getByRole("tab", { name: "Standard equipment" }));
    expect(within(dialog).getByText("21 in")).toBeInTheDocument();
    within(dialog).getByRole("tab", { name: "Standard equipment" }).focus();
    await userEvent.keyboard("{ArrowLeft}");
    expect(within(dialog).getByRole("tab", { name: "Technical data" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("closes with the close button and with Escape, returning focus to the trigger", async () => {
    await openDrawer();
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: "Technical data" })).toHaveFocus();
    await userEvent.click(screen.getByRole("button", { name: "Technical data" }));
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: "Technical data" })).toHaveFocus();
  });

  it("returns focus to returnFocusTo even when the opening click didn't focus it (Safari)", async () => {
    function Unfocused() {
      const [open, setOpen] = useState(false);
      const [trigger, setTrigger] = useState<HTMLElement | null>(null);
      return (
        <>
          <button
            type="button"
            // Simulates Safari: a click that doesn't move focus to the button.
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => {
              setTrigger(e.currentTarget);
              setOpen(true);
            }}
          >
            Technical data
          </button>
          <SpecDrawer {...CONTENT_EN} open={open} onOpenChange={setOpen} returnFocusTo={trigger} />
        </>
      );
    }
    render(<Unfocused />);
    const trigger = screen.getByRole("button", { name: "Technical data" });
    await userEvent.click(trigger);
    await userEvent.keyboard("{Escape}");
    expect(trigger).toHaveFocus();
  });

  it("Configure is disabled until the configurator exists, and a link when it does", async () => {
    const dialog = await openDrawer();
    expect(within(dialog).getByRole("button", { name: "Configure" })).toBeDisabled();
    cleanup();
    const linked = await openDrawer({ ...CONTENT_EN, configureHref: "/configure/aurora" });
    expect(within(linked).getByRole("link", { name: "Configure" })).toHaveAttribute(
      "href",
      "/configure/aurora",
    );
  });

  it("with no ledger, shows the pending note instead of tabs; one tab needs no tab list", async () => {
    const empty = await openDrawer({ ...CONTENT_EN, tabs: [] });
    expect(within(empty).queryByRole("tablist")).toBeNull();
    expect(within(empty).getByText(/Data will be added/)).toBeInTheDocument();
    cleanup();
    const single = await openDrawer({ ...CONTENT_EN, tabs: [CONTENT_EN.tabs[0]!] });
    expect(within(single).queryByRole("tablist")).toBeNull();
    expect(within(single).getByText("500 hp")).toBeInTheDocument();
  });

  it("has no axe violations when open, in both directions", async () => {
    await openDrawer();
    expect(await axe(document.body)).toHaveNoViolations();
    cleanup();
    render(
      <div dir="rtl" lang="ar">
        <Harness content={CONTENT_AR} />
      </div>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Technical data" }));
    // The drawer is portaled to <body>, so it must carry its own direction.
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("dir", "rtl");
    expect(await axe(document.body)).toHaveNoViolations();
  });

  it("in RTL, the arrow keys move between tabs in the reading direction", async () => {
    const twoTabs = {
      ...CONTENT_AR,
      tabs: [CONTENT_AR.tabs[0]!, { key: "equip", label: "التجهيزات القياسية", groups: [] }],
    };
    const dialog = await openDrawer(twoTabs);
    const [first, second] = within(dialog).getAllByRole("tab");
    first!.focus();
    // In RTL the next tab is to the LEFT.
    await userEvent.keyboard("{ArrowLeft}");
    expect(second).toHaveAttribute("aria-selected", "true");
    await userEvent.keyboard("{ArrowRight}");
    expect(first).toHaveAttribute("aria-selected", "true");
  });

  it("the model name is a heading below the dialog's title, and each group toggle sits in a heading", async () => {
    const dialog = await openDrawer();
    expect(
      within(dialog).getByRole("heading", { level: 3, name: "Aurora GT" }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("heading", { level: 4, name: "Performance" }),
    ).toBeInTheDocument();
  });
});
