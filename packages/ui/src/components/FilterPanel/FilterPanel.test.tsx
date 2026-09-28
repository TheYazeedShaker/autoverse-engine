import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FilterPanel } from "./FilterPanel";
import { FilterSheet } from "./FilterSheet";
import { FilterSidebar } from "./FilterSidebar";
import { GROUPS_AR, GROUPS_EN, LABELS_AR, LABELS_EN, SORT_EN, useFilterState } from "./fixtures";

function Sidebar({ initial }: { initial?: Record<string, string[]> }) {
  const state = useFilterState(initial);
  return <FilterSidebar labels={LABELS_EN} groups={GROUPS_EN} sortOptions={SORT_EN} {...state} />;
}

function Sheet() {
  const state = useFilterState();
  return (
    <FilterSheet
      triggerLabel="Filters"
      doneLabel="Show 4 models"
      status="4 of 5 models"
      labels={LABELS_EN}
      groups={GROUPS_EN}
      sortOptions={SORT_EN}
      {...state}
    />
  );
}

afterEach(cleanup);

describe("FilterPanel", () => {
  it("renders a group per facet with its options and counts, from props only", () => {
    render(<Sidebar />);
    const body = screen.getByRole("button", { name: /Body type/ });
    expect(body).toHaveAttribute("aria-expanded", "true");
    // The visible count is aria-hidden; screen readers hear the label and the count in words.
    const suv = screen.getByRole("button", { name: "SUV, 3 models" });
    expect(suv).toHaveAttribute("aria-pressed", "false");
    expect(suv).toHaveTextContent("3");
    expect(screen.getByRole("button", { name: "Hatchback, 1 model" })).toBeInTheDocument();
  });

  it("toggles an option (aria-pressed) and paints it with the brand accent", async () => {
    render(<Sidebar />);
    const suv = screen.getByRole("button", { name: /^SUV/ });
    await userEvent.click(suv);
    expect(suv).toHaveAttribute("aria-pressed", "true");
    expect(suv).toHaveClass("bg-accent", "text-on-accent");
    // The group reports how many of its options are on.
    expect(screen.getByRole("button", { name: /Body type.*1 selected/ })).toBeInTheDocument();
    await userEvent.click(suv);
    expect(suv).toHaveAttribute("aria-pressed", "false");
    expect(suv).not.toHaveClass("bg-accent");
  });

  it("collapses and expands a group; a group can start closed (Seats)", async () => {
    render(<Sidebar />);
    const seats = screen.getByRole("button", { name: /Seats/ });
    expect(seats).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: /^7/ })).toBeNull();
    await userEvent.click(seats);
    expect(seats).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: /^7/ })).toBeInTheDocument();
  });

  it("searches through a labelled search field", async () => {
    const onSearchChange = vi.fn();
    render(
      <FilterPanel
        labels={LABELS_EN}
        groups={GROUPS_EN}
        sortOptions={SORT_EN}
        search=""
        onSearchChange={onSearchChange}
        sort="featured"
        onSortChange={() => {}}
        selected={{}}
        onToggle={() => {}}
        onClear={() => {}}
      />,
    );
    await userEvent.type(screen.getByRole("searchbox", { name: "Search models" }), "a");
    expect(onSearchChange).toHaveBeenCalledWith("a");
  });

  it("sorts with a labelled native select holding the four orders", async () => {
    render(<Sidebar />);
    const sort = screen.getByRole("combobox", { name: "Sort by" });
    expect(
      within(sort)
        .getAllByRole("option")
        .map((o) => o.getAttribute("value")),
    ).toEqual(["featured", "name", "power", "accel"]);
    await userEvent.selectOptions(sort, "power");
    expect(sort).toHaveValue("power");
  });

  it("shows Clear all only when something is active, and it clears filters and search", async () => {
    render(<Sidebar />);
    expect(screen.queryByRole("button", { name: "Clear all" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: /^EV/ }));
    await userEvent.type(screen.getByRole("searchbox"), "gt");
    await userEvent.click(screen.getByRole("button", { name: "Clear all" }));
    expect(screen.getByRole("button", { name: /^EV/ })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("searchbox")).toHaveValue("");
    expect(screen.queryByRole("button", { name: "Clear all" })).toBeNull();
  });

  it("Clear all moves focus to the search field (the button itself unmounts)", async () => {
    render(<Sidebar initial={{ body: ["suv"] }} />);
    await userEvent.click(screen.getByRole("button", { name: "Clear all" }));
    expect(screen.getByRole("searchbox")).toHaveFocus();
  });

  it("a selected chip's count is never dimmed (on-accent is validated at full strength)", async () => {
    render(<Sidebar />);
    const suv = screen.getByRole("button", { name: /^SUV/ });
    await userEvent.click(suv);
    const count = within(suv).getByText("3");
    expect(count.className).not.toMatch(/opacity|text-fg-muted/);
  });

  it("the sidebar is a named, sticky landmark", () => {
    render(<Sidebar />);
    const aside = screen.getByRole("complementary", { name: "Filters" });
    expect(aside).toHaveClass("sticky");
  });

  it("has no axe violations, in both directions", async () => {
    const { container } = render(<Sidebar initial={{ body: ["suv"] }} />);
    expect(await axe(container)).toHaveNoViolations();
    function Arabic() {
      const state = useFilterState({ fuel: ["ev"] });
      return (
        <div dir="rtl" lang="ar">
          <FilterSidebar
            labels={LABELS_AR}
            groups={GROUPS_AR}
            sortOptions={[{ value: "featured", label: "المميز" }]}
            {...state}
          />
        </div>
      );
    }
    const rtl = render(<Arabic />).container;
    expect(await axe(rtl)).toHaveNoViolations();
  });
});

describe("FilterSheet", () => {
  it("opens a titled dialog from its trigger; the done button closes it and focus returns", async () => {
    render(<Sheet />);
    const trigger = screen.getByRole("button", { name: "Filters" });
    await userEvent.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Filters" });
    // The sheet takes focus itself, not the search field (no phone keyboard on open).
    expect(dialog).toHaveFocus();
    expect(within(dialog).getByRole("searchbox", { name: "Search models" })).toBeInTheDocument();
    // Filters apply live inside the sheet.
    const suv = within(dialog).getByRole("button", { name: /^SUV/ });
    await userEvent.click(suv);
    expect(suv).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(within(dialog).getByRole("button", { name: "Show 4 models" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it("closes on Escape", async () => {
    render(<Sheet />);
    await userEvent.click(screen.getByRole("button", { name: "Filters" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("keeps the selection across open/close (the state is the app's)", async () => {
    render(<Sheet />);
    await userEvent.click(screen.getByRole("button", { name: "Filters" }));
    await userEvent.click(screen.getByRole("button", { name: /^EV/ }));
    await userEvent.keyboard("{Escape}");
    await userEvent.click(screen.getByRole("button", { name: "Filters" }));
    expect(screen.getByRole("button", { name: /^EV/ })).toHaveAttribute("aria-pressed", "true");
  });

  it("announces the result count inside the sheet (the page's live region is hidden by the modal)", async () => {
    render(<Sheet />);
    await userEvent.click(screen.getByRole("button", { name: "Filters" }));
    expect(within(screen.getByRole("dialog")).getByRole("status")).toHaveTextContent(
      "4 of 5 models",
    );
  });

  it("has no axe violations when open, in both directions", async () => {
    render(<Sheet />);
    await userEvent.click(screen.getByRole("button", { name: "Filters" }));
    expect(await axe(document.body)).toHaveNoViolations();
    cleanup();
    function Arabic() {
      const state = useFilterState();
      return (
        <div dir="rtl" lang="ar">
          <FilterSheet
            triggerLabel="الفلاتر"
            doneLabel="عرض طرازين"
            status="٢ من ٢ طرازات"
            labels={LABELS_AR}
            groups={GROUPS_AR}
            sortOptions={[{ value: "featured", label: "ترتيب · المميز" }]}
            {...state}
          />
        </div>
      );
    }
    render(<Arabic />);
    await userEvent.click(screen.getByRole("button", { name: "الفلاتر" }));
    expect(await axe(document.body)).toHaveNoViolations();
  });
});
