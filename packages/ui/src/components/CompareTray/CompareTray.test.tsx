import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { CompareToggle } from "./CompareToggle";
import { CompareTray, type CompareTrayItem, type CompareTrayProps } from "./CompareTray";

afterEach(cleanup);

const LABELS: CompareTrayProps["labels"] = {
  region: "Comparison",
  remove: (name) => `Remove ${name}`,
  removeShort: "Remove",
  compare: (n) => `Compare ${n}`,
  status: (n) => `${n} selected for comparison`,
};

const TRIMS: CompareTrayItem[] = [
  { id: "a", name: "Aurora GT Long Range", thumbnail: null },
  { id: "b", name: "Vela Base", thumbnail: null },
  { id: "c", name: "Nimbus Base", thumbnail: null },
  { id: "d", name: "Stratos Sport", thumbnail: null },
];

/** Cards with a toggle each, and the tray, sharing one selection (as the app wires them). */
function Harness({ limit = 3, href = "/compare" }: { limit?: number; href?: string | null }) {
  const [selected, setSelected] = useState<string[]>([]);
  return (
    <>
      {TRIMS.map((t) => (
        <CompareToggle
          key={t.id}
          value={t.id}
          label={`Compare ${t.name}`}
          checked={selected.includes(t.id)}
          atLimit={selected.length >= limit}
          limitNote={`Up to ${limit} trims can be compared`}
          onCheckedChange={(on) =>
            setSelected((s) => (on ? [...s, t.id] : s.filter((x) => x !== t.id)))
          }
        />
      ))}
      <CompareTray
        items={TRIMS.filter((t) => selected.includes(t.id))}
        onRemove={(id) => setSelected((s) => s.filter((x) => x !== id))}
        href={href && selected.length ? `${href}?trims=${selected.join(",")}` : null}
        labels={LABELS}
      />
    </>
  );
}

const box = (name: string) => screen.getByRole("checkbox", { name: `Compare ${name}` });

describe("CompareToggle + CompareTray", () => {
  it("the tray appears with the first pick and lists what was picked", async () => {
    render(<Harness />);
    expect(screen.queryByRole("region", { name: "Comparison" })).toBeNull();
    await userEvent.click(box("Aurora GT Long Range"));
    const tray = screen.getByRole("region", { name: "Comparison" });
    expect(within(tray).getByText("Aurora GT Long Range")).toBeInTheDocument();
    expect(screen.getByText("1 selected for comparison")).toBeInTheDocument();
  });

  it("Compare N is disabled with one pick and links from two", async () => {
    render(<Harness />);
    await userEvent.click(box("Aurora GT Long Range"));
    expect(screen.getByRole("button", { name: "Compare 1" })).toBeDisabled();
    await userEvent.click(box("Vela Base"));
    expect(screen.getByRole("link", { name: "Compare 2" })).toHaveAttribute(
      "href",
      "/compare?trims=a,b",
    );
  });

  it("stops at the limit: the other toggles disable and say why", async () => {
    render(<Harness limit={3} />);
    for (const n of ["Aurora GT Long Range", "Vela Base", "Nimbus Base"]) {
      await userEvent.click(box(n));
    }
    const fourth = box("Stratos Sport");
    // aria-disabled, not disabled: still focusable, so the rule is heard; a click changes nothing.
    expect(fourth).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(fourth);
    expect(fourth).not.toBeChecked();
    expect(fourth).toHaveAccessibleDescription("Up to 3 trims can be compared");
    // Picked ones stay enabled, so they can be unpicked.
    expect(box("Vela Base")).not.toHaveAttribute("aria-disabled");
    await userEvent.click(box("Vela Base"));
    expect(fourth).not.toHaveAttribute("aria-disabled");
  });

  it("Remove unpicks it, keeps focus in the tray, and the tray goes with the last one", async () => {
    render(<Harness />);
    await userEvent.click(box("Aurora GT Long Range"));
    await userEvent.click(box("Vela Base"));
    await userEvent.click(screen.getByRole("button", { name: "Remove Aurora GT Long Range" }));
    expect(box("Aurora GT Long Range")).not.toBeChecked();
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    expect(screen.getByRole("button", { name: "Remove Vela Base" })).toHaveFocus();
    await userEvent.click(screen.getByRole("button", { name: "Remove Vela Base" }));
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    // The tray is gone: focus returns to that trim's own checkbox, and zero is announced.
    expect(box("Vela Base")).toHaveFocus();
    expect(screen.getByText("0 selected for comparison")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Comparison" })).toBeNull();
  });

  it("without a compare page (its flag is off), Compare stays disabled", async () => {
    render(<Harness href={null} />);
    await userEvent.click(box("Aurora GT Long Range"));
    await userEvent.click(box("Vela Base"));
    expect(screen.getByRole("button", { name: "Compare 2" })).toBeDisabled();
  });

  it("a toggle is a real, labelled checkbox (keyboard: Space)", async () => {
    render(<Harness />);
    box("Vela Base").focus();
    await userEvent.keyboard(" ");
    expect(box("Vela Base")).toBeChecked();
  });

  it("has no axe violations, in both directions", async () => {
    const { container } = render(<Harness />);
    await userEvent.click(box("Aurora GT Long Range"));
    await userEvent.click(box("Vela Base"));
    expect(await axe(container)).toHaveNoViolations();
    cleanup();
    const rtl = render(
      <div dir="rtl" lang="ar">
        <Harness />
      </div>,
    ).container;
    await userEvent.click(screen.getAllByRole("checkbox")[0]!);
    expect(await axe(rtl)).toHaveNoViolations();
  });
});
