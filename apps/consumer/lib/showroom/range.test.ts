import { describe, expect, it, vi } from "vitest";
import type { Logger } from "../log";
import { COPY } from "./copy";
import { demoCatalog } from "./fixtures/demo-catalog";
import { buildShowroom } from "./loader";
import {
  activeCount,
  facetGroups,
  foldForSearch,
  isFacetKey,
  isSortKey,
  modelFacts,
  NO_SELECTION,
  toggle,
  visibleModelIds,
  type ModelFacts,
  type Selection,
} from "./range";

const m = (id: string, over: Partial<ModelFacts> = {}): ModelFacts => ({
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

// In line-up (featured) order.
const RANGE: ModelFacts[] = [
  m("zeta", { names: { en: "Zeta", ar: "زيتا" }, powerHp: 400, accelS: 5.5, seats: ["5", "7"] }),
  m("alpha", {
    names: { en: "Alpha", ar: "ألفا" },
    body: "hatch",
    fuel: "petrol",
    drives: ["fwd"],
    powerHp: 150,
    accelS: 9,
  }),
  m("mid", { names: { en: "Mid", ar: "ميد" }, drives: ["awd", "rwd"], powerHp: null, accelS: 4.1 }),
  m("tie", { names: { en: "Tie", ar: "تاي" }, powerHp: 400, accelS: null }),
];

const pick = (over: Partial<Selection>): Selection => ({ ...NO_SELECTION, ...over });
const run = (
  sel: Selection = NO_SELECTION,
  q = "",
  sort: Parameters<typeof visibleModelIds>[3] = "featured",
  lang: "en" | "ar" = "en",
) => visibleModelIds(RANGE, sel, q, sort, lang, "ar-EG");

describe("visibleModelIds: filters hide whole models", () => {
  it("shows everything, in line-up order, with nothing selected", () => {
    expect(run()).toEqual(["zeta", "alpha", "mid", "tie"]);
  });

  it("ORs options within a group", () => {
    expect(run(pick({ body: ["hatch"] }))).toEqual(["alpha"]);
    expect(run(pick({ body: ["hatch", "suv"] }))).toEqual(["zeta", "alpha", "mid", "tie"]);
  });

  it("ANDs across groups", () => {
    expect(run(pick({ body: ["suv"], fuel: ["petrol"] }))).toEqual([]);
    expect(run(pick({ body: ["suv"], drive: ["rwd"] }))).toEqual(["mid"]);
  });

  it("matches drive and seats when ANY trim has the value (as the counts do)", () => {
    expect(run(pick({ drive: ["rwd"] }))).toEqual(["mid"]);
    expect(run(pick({ seats: ["7"] }))).toEqual(["zeta"]);
  });

  it("a model with no value for a filtered facet is hidden by that filter", () => {
    const withNull = [...RANGE, m("bare", { body: null, fuel: null, drives: [], seats: [] })];
    expect(
      visibleModelIds(withNull, pick({ body: ["suv"] }), "", "featured", "en", "ar-EG"),
    ).not.toContain("bare");
    expect(visibleModelIds(withNull, NO_SELECTION, "", "featured", "en", "ar-EG")).toContain(
      "bare",
    );
  });
});

describe("visibleModelIds: search", () => {
  it("matches the model name, case-insensitively, trimmed", () => {
    expect(run(NO_SELECTION, "  ZE ")).toEqual(["zeta"]);
    expect(run(NO_SELECTION, "nothing")).toEqual([]);
  });

  it("matches the Arabic name too", () => {
    expect(run(NO_SELECTION, "ألفا")).toEqual(["alpha"]);
  });

  it("folds Arabic spelling variants: hamza forms, diacritics, tatweel", () => {
    expect(run(NO_SELECTION, "الفا")).toEqual(["alpha"]);
    expect(run(NO_SELECTION, "أَلْفا")).toEqual(["alpha"]);
    expect(run(NO_SELECTION, "زيـــتا")).toEqual(["zeta"]);
    expect(foldForSearch("مدينة مصرى")).toBe("مدينه مصري");
  });

  it("combines with filters", () => {
    expect(run(pick({ fuel: ["ev"] }), "al")).toEqual([]);
  });
});

describe("visibleModelIds: sort", () => {
  it("name: A–Z in the page's language", () => {
    expect(run(NO_SELECTION, "", "name")).toEqual(["alpha", "mid", "tie", "zeta"]);
    expect(run(NO_SELECTION, "", "name", "ar")).toEqual(["alpha", "tie", "zeta", "mid"]);
  });

  it("power: high to low; missing figures last; ties keep line-up order", () => {
    expect(run(NO_SELECTION, "", "power")).toEqual(["zeta", "tie", "alpha", "mid"]);
  });

  it("0–100: quickest first; missing figures last", () => {
    expect(run(NO_SELECTION, "", "accel")).toEqual(["mid", "zeta", "alpha", "tie"]);
  });

  it("sorts only what the filters leave", () => {
    expect(run(pick({ body: ["suv"] }), "", "accel")).toEqual(["mid", "zeta", "tie"]);
  });
});

describe("selection helpers", () => {
  it("toggles a value on and off, leaving other groups alone", () => {
    const on = toggle(NO_SELECTION, "body", "suv");
    expect(on.body).toEqual(["suv"]);
    expect(toggle(on, "body", "suv").body).toEqual([]);
    expect(toggle(on, "fuel", "ev")).toEqual(pick({ body: ["suv"], fuel: ["ev"] }));
  });

  it("counts active options across groups", () => {
    expect(activeCount(pick({ body: ["suv", "hatch"], seats: ["7"] }))).toBe(3);
  });

  it("accepts only the four sort keys", () => {
    expect(["featured", "name", "power", "accel"].every(isSortKey)).toBe(true);
    expect(isSortKey("price")).toBe(false);
  });

  it("accepts only the four facet keys", () => {
    expect(["body", "fuel", "drive", "seats"].every(isFacetKey)).toBe(true);
    expect(isFacetKey("colour")).toBe(false);
  });
});

describe("from the catalogue", () => {
  const view = () => buildShowroom(demoCatalog(), vi.fn() as unknown as Logger);

  it("modelFacts: keys from the vocabulary; the best figure across trims", () => {
    const suv = modelFacts(view().models[0]!);
    expect(suv).toMatchObject({ body: "suv", fuel: "petrol", drives: ["awd"] });
    // Two trims: 420 hp / 6.4 s and 460 hp / 5.9 s.
    expect(suv.powerHp).toBe(460);
    expect(suv.accelS).toBe(5.9);
    expect(suv.seats).toEqual(["7"]);
  });

  it("facetGroups: the four groups in order, only those with options", () => {
    const groups = facetGroups(view().facets);
    expect(groups.map((g) => g.key)).toEqual(["body", "fuel", "drive", "seats"]);
    expect(groups.find((g) => g.key === "drive")!.options.map((o) => [o.value, o.count])).toEqual([
      ["awd", 1],
      ["rwd", 1],
    ]);
  });
});

describe("filter copy", () => {
  it("counts models in both languages, with Arabic plural forms", () => {
    expect(COPY.en.resultCount("4", "5", 5)).toBe("4 of 5 models");
    expect(COPY.en.showResults("1", 1)).toBe("Show 1 model");
    expect(COPY.ar.resultCount("٤", "٥", 5)).toBe("٤ من ٥ طرازات");
    expect(COPY.ar.resultCount("١", "٢", 2)).toBe("١ من ٢ طرازات");
    expect(COPY.ar.resultCount("٠", "٠", 0)).toBe("٠ من ٠ طراز");
    expect(COPY.ar.resultCount("٣", "١٢", 12)).toBe("٣ من ١٢ طرازًا");
    expect(COPY.ar.showResults("١", 1)).toBe("عرض طراز واحد");
    expect(COPY.ar.showResults("٢", 2)).toBe("عرض طرازين");
    expect(COPY.ar.models("١١", 11)).toBe("١١ طرازًا");
    expect(COPY.ar.models("١٠٠", 100)).toBe("١٠٠ طراز");
    expect(COPY.ar.showResults("٠", 0)).toBe("عرض ٠ طراز");
  });
});
