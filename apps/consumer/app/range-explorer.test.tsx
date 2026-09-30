// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import type { FacetOption } from "../lib/showroom/loader";
import type { FacetKey, ModelFacts } from "../lib/showroom/range";
import { RangeExplorer } from "./range-explorer";

// The client wiring: state → which server-rendered sections show, in what order, and the counts.
// The rules themselves are unit tested in lib/showroom/range.test.ts.

afterEach(cleanup);

const facts = (id: string, over: Partial<ModelFacts>): ModelFacts => ({
  id,
  names: { en: id, ar: id },
  body: "suv",
  fuel: "ev",
  drives: ["awd"],
  seats: ["5"],
  powerHp: 300,
  accelS: 6,
  ...over,
});

const MODELS = [
  facts("Zeta", { powerHp: 500, accelS: 4 }),
  facts("Alpha", { fuel: "petrol", powerHp: 200, accelS: 8 }),
  facts("Mid", { powerHp: 350, accelS: 5 }),
];

const opt = (value: string, en: string, count: number): FacetOption => ({
  value,
  label: { en, ar: en },
  count,
});
const FACETS: { key: FacetKey; options: FacetOption[] }[] = [
  { key: "fuel", options: [opt("ev", "EV", 2), opt("petrol", "Petrol", 1)] },
];

function explorer(lang: "en" | "ar" = "en") {
  return render(
    <RangeExplorer
      lang={lang}
      locale="ar-EG"
      numberingSystem={lang === "ar" ? "arab" : "latn"}
      facets={FACETS}
      header={<h1>The Range</h1>}
      sections={MODELS.map((m) => ({
        facts: m,
        node: <section aria-label={m.names.en}>{m.names.en}</section>,
      }))}
    />,
  );
}

const order = () =>
  [...document.querySelectorAll("[data-range-model]")].map((e) =>
    e.getAttribute("data-range-model"),
  );
const sidebar = () => within(screen.getByRole("complementary", { name: "Filters" }));
const result = () => document.querySelector("[data-result-count]")!;

describe("RangeExplorer", () => {
  it("first renders exactly the server's sections, in line-up order", () => {
    explorer();
    expect(order()).toEqual(["Zeta", "Alpha", "Mid"]);
    expect(result()).toHaveProperty("textContent", "3 of 3 models");
  });

  it("a chip hides whole models and updates the count", async () => {
    explorer();
    await userEvent.click(sidebar().getByRole("button", { name: /^Petrol/ }));
    expect(order()).toEqual(["Alpha"]);
    expect(result().textContent).toBe("1 of 3 models");
  });

  it("sort reorders the sections", async () => {
    explorer();
    await userEvent.selectOptions(sidebar().getByRole("combobox", { name: "Sort by" }), "power");
    expect(order()).toEqual(["Zeta", "Mid", "Alpha"]);
    await userEvent.selectOptions(sidebar().getByRole("combobox", { name: "Sort by" }), "name");
    expect(order()).toEqual(["Alpha", "Mid", "Zeta"]);
  });

  it("shows the empty state; its Clear all restores everything and keeps focus on the page", async () => {
    explorer();
    await userEvent.type(sidebar().getByRole("searchbox"), "nothing");
    expect(order()).toEqual([]);
    expect(screen.getByText("No models match these filters.")).toBeTruthy();
    const clears = screen.getAllByRole("button", { name: "Clear all" });
    await userEvent.click(clears[clears.length - 1]!);
    expect(order()).toEqual(["Zeta", "Alpha", "Mid"]);
    expect(document.activeElement).toBe(result());
  });

  it("the mobile sheet's done label and status track the count", async () => {
    explorer();
    await userEvent.click(screen.getByRole("button", { name: "Filters" }));
    const sheet = within(screen.getByRole("dialog", { name: "Filters" }));
    await userEvent.click(sheet.getByRole("button", { name: /^EV/ }));
    expect(sheet.getByRole("button", { name: "Show 2 models" })).toBeTruthy();
    expect(sheet.getByRole("status").textContent).toBe("2 of 3 models");
    await userEvent.click(sheet.getByRole("button", { name: "Show 2 models" }));
    // The sheet stays mounted (the page behind it hidden) until its exit motion ends (slice 8).
    await waitFor(() => expect(screen.getByRole("button", { name: "Filters · 1" })).toBeTruthy());
    expect(order()).toEqual(["Zeta", "Mid"]);
  });

  it("uses the server-resolved digits in Arabic", () => {
    explorer("ar");
    expect(result().textContent).toBe("٣ من ٣ طرازات");
  });
});
