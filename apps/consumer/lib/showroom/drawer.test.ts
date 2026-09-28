import { describe, expect, it, vi } from "vitest";
import type { Logger } from "../log";
import { COPY } from "./copy";
import { drawerContent } from "./drawer";
import { DEMO_IDS, demoCatalog } from "./fixtures/demo-catalog";
import { buildShowroom } from "./loader";

// The drawer's content for one trim, from the ledger (spec §5.8).

const TAB = "00000000-0000-0000-0000-0000000000a1";
const G_PERF = "00000000-0000-0000-0000-0000000000b1";
const G_EMPTY = "00000000-0000-0000-0000-0000000000b2";
const G_NOTE = "00000000-0000-0000-0000-0000000000b3";

function view(withSpec = true) {
  const snapshot = demoCatalog();
  const [base, sport] = snapshot.trims.filter((t) => t.model_id === DEMO_IDS.suv);
  if (withSpec) {
    snapshot.spec = {
      tabs: [
        {
          id: TAB,
          model_id: DEMO_IDS.suv,
          key: "tech",
          title_en: "Technical data",
          title_ar: "البيانات الفنية",
          order_index: 1,
        },
      ],
      groups: [
        {
          id: G_EMPTY,
          tab_id: TAB,
          model_id: DEMO_IDS.suv,
          title_en: "Sound level",
          title_ar: "الضوضاء",
          note_en: null,
          note_ar: null,
          order_index: 2,
        },
        {
          id: G_PERF,
          tab_id: TAB,
          model_id: DEMO_IDS.suv,
          title_en: "Performance",
          title_ar: "الأداء",
          note_en: null,
          note_ar: null,
          order_index: 1,
        },
        {
          id: G_NOTE,
          tab_id: TAB,
          model_id: DEMO_IDS.suv,
          title_en: "Consumption",
          title_ar: "الاستهلاك",
          note_en: "Figures per WLTP.",
          note_ar: "وفق WLTP.",
          order_index: 3,
        },
      ],
      rows: [
        {
          id: "00000000-0000-0000-0000-0000000000c2",
          group_id: G_PERF,
          model_id: DEMO_IDS.suv,
          key_en: "Power",
          key_ar: "القوة",
          scope: "per_trim",
          value_en: null,
          value_ar: null,
          trim_values: {
            [base!.id]: { en: "420 hp", ar: "٤٢٠ حصان" },
            [sport!.id]: { en: "460 hp", ar: "٤٦٠ حصان" },
          },
          order_index: 2,
        },
        {
          id: "00000000-0000-0000-0000-0000000000c1",
          group_id: G_PERF,
          model_id: DEMO_IDS.suv,
          key_en: "Top speed",
          key_ar: "السرعة القصوى",
          scope: "all_trims",
          value_en: "200 km/h",
          value_ar: "٢٠٠ كم/س",
          trim_values: null,
          order_index: 1,
        },
        {
          id: "00000000-0000-0000-0000-0000000000c3",
          group_id: G_PERF,
          model_id: DEMO_IDS.suv,
          key_en: "Sport exhaust",
          key_ar: "عادم رياضي",
          scope: "per_trim",
          value_en: null,
          value_ar: null,
          trim_values: { [sport!.id]: { en: "Standard", ar: "قياسي" } },
          order_index: 3,
        },
      ],
    };
  }
  return buildShowroom(snapshot, vi.fn() as unknown as Logger);
}

describe("drawerContent", () => {
  it("resolves every row for the chosen trim, in ledger order", () => {
    const v = view();
    const suv = v.models[0]!;
    const base = drawerContent(suv, suv.trims[0]!, "en", v.market, "Demo Motors", COPY.en);
    const perf = base.tabs[0]!.groups[0]!;
    expect(perf.label).toBe("Performance");
    // All-trims row, then the per-trim row with THIS trim's value; the Sport-only row is left out.
    expect(perf.rows).toEqual([
      { k: "Top speed", v: "200 km/h" },
      { k: "Power", v: "420 hp" },
    ]);
    const sport = drawerContent(suv, suv.trims[1]!, "en", v.market, "Demo Motors", COPY.en);
    expect(sport.tabs[0]!.groups[0]!.rows).toEqual([
      { k: "Top speed", v: "200 km/h" },
      { k: "Power", v: "460 hp" },
      { k: "Sport exhaust", v: "Standard" },
    ]);
  });

  it("an empty group shows the 'data will be added' note; a group's own note always shows", () => {
    const v = view();
    const suv = v.models[0]!;
    const d = drawerContent(suv, suv.trims[0]!, "en", v.market, "Demo Motors", COPY.en);
    const [, empty, noted] = d.tabs[0]!.groups;
    expect(empty).toEqual({
      label: "Sound level",
      note: "Data will be added once provided by Demo Motors.",
      rows: [],
    });
    expect(noted!.note).toBe("Figures per WLTP.");
  });

  it("names the trim, the model year and brand, and the price (never 0)", () => {
    const v = view();
    const suv = v.models[0]!;
    const d = drawerContent(suv, suv.trims[0]!, "en", v.market, "Demo Motors", COPY.en);
    expect(d.eyebrow).toMatch(/^\d{4} · Demo Motors$/);
    expect(d.modelName).toBe("Demo SUV");
    expect(d.trimName).toBe("Base");
    expect(d.price).toMatch(/^From EGP\s?3,900,000$/);
    const ev = v.models[1]!;
    expect(drawerContent(ev, ev.trims[0]!, "en", v.market, "Demo Motors", COPY.en).price).toBe(
      "Price on request",
    );
  });

  it("is fully Arabic in AR", () => {
    const v = view();
    const suv = v.models[0]!;
    const d = drawerContent(suv, suv.trims[0]!, "ar", v.market, "ديمو موتورز", COPY.ar);
    expect(d.tabs[0]!.label).toBe("البيانات الفنية");
    expect(d.tabs[0]!.groups[0]!.rows[1]).toEqual({ k: "القوة", v: "٤٢٠ حصان" });
    expect(d.tabs[0]!.groups[1]!.note).toBe("ستُضاف البيانات فور توفرها من ديمو موتورز.");
  });

  it("a model with no ledger has no tabs, only the pending note", () => {
    const v = view(false);
    const suv = v.models[0]!;
    const d = drawerContent(suv, suv.trims[0]!, "en", v.market, "Demo Motors", COPY.en);
    expect(d.tabs).toEqual([]);
    expect(d.pending).toBe("Data will be added once provided by Demo Motors.");
  });

  it("the loader drops a tab of an unknown model, and a row whose group was rejected (both logged)", () => {
    const snapshot = demoCatalog();
    const OTHER_MODEL = "00000000-0000-0000-0000-00000000ffff";
    const BAD_GROUP = "00000000-0000-0000-0000-0000000000b9";
    snapshot.spec = {
      tabs: [
        {
          id: TAB,
          model_id: DEMO_IDS.suv,
          key: "tech",
          title_en: "T",
          title_ar: "T",
          order_index: 1,
        },
        {
          id: "00000000-0000-0000-0000-0000000000a9",
          model_id: OTHER_MODEL,
          key: "x",
          title_en: "X",
          title_ar: "X",
          order_index: 2,
        },
      ],
      groups: [
        {
          id: G_PERF,
          tab_id: TAB,
          model_id: DEMO_IDS.suv,
          title_en: "Good",
          title_ar: "G",
          note_en: null,
          note_ar: null,
          order_index: 1,
        },
        // In the same tab, but claiming another model: rejected.
        {
          id: BAD_GROUP,
          tab_id: TAB,
          model_id: OTHER_MODEL,
          title_en: "Bad",
          title_ar: "B",
          note_en: null,
          note_ar: null,
          order_index: 2,
        },
      ],
      rows: [
        {
          id: "00000000-0000-0000-0000-0000000000c9",
          group_id: BAD_GROUP,
          model_id: OTHER_MODEL,
          key_en: "Stray",
          key_ar: "Stray",
          scope: "all_trims",
          value_en: "x",
          value_ar: "x",
          trim_values: null,
          order_index: 1,
        },
      ],
    };
    const log = vi.fn();
    const v = buildShowroom(snapshot, log as unknown as Logger);
    const spec = v.models[0]!.spec;
    expect(spec).toHaveLength(1);
    expect(spec[0]!.groups.map((g) => g.title.en)).toEqual(["Good"]);
    expect(JSON.stringify(spec)).not.toContain("Stray");
    for (const kind of ["spec_tab", "spec_group", "spec_row"]) {
      expect(log).toHaveBeenCalledWith("warn", "showroom_payload_orphan", { brand: "demo", kind });
    }
  });

  it("the loader drops a ledger group whose tab isn't in the payload (and logs it)", () => {
    const snapshot = demoCatalog();
    snapshot.spec = {
      tabs: [],
      groups: [
        {
          id: G_PERF,
          tab_id: TAB,
          model_id: DEMO_IDS.suv,
          title_en: "x",
          title_ar: "x",
          note_en: null,
          note_ar: null,
          order_index: 1,
        },
      ],
      rows: [],
    };
    const log = vi.fn();
    const v = buildShowroom(snapshot, log as unknown as Logger);
    expect(v.models[0]!.spec).toEqual([]);
    expect(log).toHaveBeenCalledWith("warn", "showroom_payload_orphan", {
      brand: "demo",
      kind: "spec_group",
    });
  });
});
