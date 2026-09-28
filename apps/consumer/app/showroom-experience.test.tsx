// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { ModelFacts } from "../lib/showroom/range";
import { ShowroomExperience } from "./showroom-experience";
import { TechnicalDataButton } from "./spec-drawer-trigger";
import { CompareCheckbox } from "./compare-controls";

// The shared shell: the dock shows only the models the filters leave visible, in their order, and
// disappears below 2; the hero and the dock share one active model.

beforeAll(() => {
  // jsdom has no layout observers or media queries (Embla and motion need them to mount).
  class Inert {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  }
  const g = globalThis as Record<string, unknown>;
  g.ResizeObserver ??= Inert;
  g.IntersectionObserver ??= Inert;
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  Element.prototype.scrollIntoView ??= function () {};
});
afterEach(cleanup);

const facts = (id: string, fuel: string, powerHp: number): ModelFacts => ({
  id,
  names: { en: id, ar: id },
  body: "suv",
  fuel,
  drives: ["awd"],
  seats: ["5"],
  powerHp,
  accelS: 6,
});
const MODELS = [facts("Zeta", "ev", 500), facts("Alpha", "petrol", 200), facts("Mid", "ev", 350)];

function shell() {
  return render(
    <ShowroomExperience
      lang="en"
      locale="ar-EG"
      numberingSystem="latn"
      hero={MODELS.map((m) => ({
        id: m.id,
        name: m.id,
        trims: [
          {
            id: `${m.id}-t`,
            label: "Base",
            image: null,
            stats: { powerHp: m.powerHp, topSpeedKph: 200, accelS: 6 },
          },
        ],
      }))}
      dock={MODELS.map((m) => ({ id: m.id, name: m.id, slug: m.id.toLowerCase() }))}
      compareBase="/compare"
      compare={Object.fromEntries(
        MODELS.map((m) => [`${m.id}-t`, { name: `${m.id} Base`, thumbnail: null }]),
      )}
      drawers={Object.fromEntries(
        MODELS.map((m) => [
          `${m.id}-t`,
          {
            image: null,
            content: {
              eyebrow: "2026 · Demo Motors",
              modelName: m.id,
              trimName: "Base",
              price: "Price on request",
              pending: "Data will be added once provided by Demo Motors.",
              tabs: [
                {
                  key: "tech",
                  label: "Technical data",
                  groups: [
                    {
                      label: "Performance",
                      note: null,
                      rows: [{ k: "Power", v: `${m.powerHp} hp` }],
                    },
                  ],
                },
              ],
            },
          },
        ]),
      )}
      range={{
        facets: [
          {
            key: "fuel",
            options: [
              { value: "ev", label: { en: "EV", ar: "EV" }, count: 2 },
              { value: "petrol", label: { en: "Petrol", ar: "Petrol" }, count: 1 },
            ],
          },
        ],
        header: <h1 id="range-title">The Range</h1>,
        sections: MODELS.map((m) => ({
          facts: m,
          node: (
            <section aria-label={m.id}>
              {m.id}
              <TechnicalDataButton
                trimId={`${m.id}-t`}
                label={`Technical data ${m.id}`}
                dir="ltr"
              />
              <CompareCheckbox
                trimId={`${m.id}-t`}
                label={`Compare ${m.id}`}
                limitNote="Two trims are compared at a time."
              />
            </section>
          ),
        })),
      }}
    />,
  );
}

// The dock is rendered (inert until the hero is scrolled past); query it by its container.
const dockLinks = () => {
  const nav = document.querySelector('nav[aria-label="Models"]');
  return nav ? [...nav.querySelectorAll("a")].map((a) => a.textContent) : null;
};
const sidebar = () => within(screen.getByRole("complementary", { name: "Filters" }));

describe("ShowroomExperience", () => {
  it("the dock lists every model at first, linked to its section", () => {
    shell();
    expect(dockLinks()).toEqual(["Zeta", "Alpha", "Mid"]);
    expect(document.querySelector('nav[aria-label="Models"] a')?.getAttribute("href")).toBe(
      "#zeta",
    );
  });

  it("the dock shows only the visible models, in their order", async () => {
    shell();
    await userEvent.click(sidebar().getByRole("button", { name: /^EV/ }));
    expect(dockLinks()).toEqual(["Zeta", "Mid"]);
    await userEvent.selectOptions(sidebar().getByRole("combobox", { name: "Sort by" }), "name");
    expect(dockLinks()).toEqual(["Mid", "Zeta"]);
  });

  it("the dock disappears below 2 visible models", async () => {
    shell();
    await userEvent.click(sidebar().getByRole("button", { name: /^Petrol/ }));
    expect(dockLinks()).toBeNull();
  });

  it("a dock pick makes that model the hero's active one", async () => {
    shell();
    const nav = document.querySelector('nav[aria-label="Models"]')!;
    await userEvent.click(within(nav as HTMLElement).getByRole("link", { name: "Mid" }));
    const hero = screen.getByRole("region", { name: "Models" });
    const current = within(hero)
      .getAllByRole("button")
      .find((b) => b.getAttribute("aria-current") === "true");
    expect(current?.textContent).toBe("Mid");
  });
});

describe("ShowroomExperience: the spec drawer", () => {
  it("a card's Technical data opens the drawer for THAT trim; closing returns focus", async () => {
    shell();
    const trigger = screen.getByRole("button", { name: /Technical data Mid/ });
    await userEvent.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Model details" });
    expect(within(dialog).getByRole("heading", { name: "Mid" })).toBeTruthy();
    expect(within(dialog).getByText("350 hp")).toBeTruthy();
    await userEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});

describe("ShowroomExperience: compare", () => {
  it("a pair: Compare links at exactly 2, a third pick is refused, Remove unpicks the card", async () => {
    shell();
    expect(screen.queryByRole("region", { name: "Comparison" })).toBeNull();
    await userEvent.click(screen.getByRole("checkbox", { name: "Compare Zeta" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Compare Mid" }));
    const tray = screen.getByRole("region", { name: "Comparison" });
    expect(within(tray).getByText("Zeta Base")).toBeTruthy();
    expect(within(tray).getByRole("link", { name: "Compare 2" }).getAttribute("href")).toBe(
      "/compare?trims=Zeta-t,Mid-t",
    );
    await userEvent.click(screen.getByRole("checkbox", { name: "Compare Alpha" }));
    // A third pick is refused: the pair is the limit (aria-disabled, so it stays focusable).
    const third = screen.getByRole("checkbox", { name: "Compare Alpha" }) as HTMLInputElement;
    expect(third.checked).toBe(false);
    expect(third.getAttribute("aria-disabled")).toBe("true");
    expect(within(tray).queryByText("Alpha Base")).toBeNull();
    await userEvent.click(within(tray).getByRole("button", { name: "Remove Zeta Base" }));
    expect(
      (screen.getByRole("checkbox", { name: "Compare Zeta" }) as HTMLInputElement).checked,
    ).toBe(false);
  });
});
