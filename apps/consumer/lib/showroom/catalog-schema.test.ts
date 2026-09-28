import { describe, expect, it } from "vitest";
import { ShowroomCatalog } from "./catalog-schema";
import { demoCatalog } from "./fixtures/demo-catalog";

// The boundary side of the spec ledger (migration 20260928120000). The keys must match the
// function's exactly (test 0025 asserts the same sets on the database side).

const M = "00000000-0000-0000-0000-00000000a001";
const T = "00000000-0000-0000-0000-00000000a101";
const spec = {
  tabs: [
    {
      id: "00000000-0000-0000-0000-0000000000a1",
      model_id: M,
      key: "tech",
      title_en: "Technical data",
      title_ar: "البيانات الفنية",
      order_index: 1,
    },
  ],
  groups: [
    {
      id: "00000000-0000-0000-0000-0000000000b1",
      tab_id: "00000000-0000-0000-0000-0000000000a1",
      model_id: M,
      title_en: "Performance",
      title_ar: "الأداء",
      note_en: null,
      note_ar: null,
      order_index: 1,
    },
  ],
  rows: [
    {
      id: "00000000-0000-0000-0000-0000000000c1",
      group_id: "00000000-0000-0000-0000-0000000000b1",
      model_id: M,
      key_en: "Power",
      key_ar: "القوة",
      scope: "per_trim",
      value_en: null,
      value_ar: null,
      trim_values: { [T]: { en: "420 hp", ar: "٤٢٠ حصان" } },
      order_index: 1,
    },
  ],
};

describe("ShowroomCatalog: the spec ledger", () => {
  it("parses a payload with the ledger", () => {
    const parsed = ShowroomCatalog.parse({ ...demoCatalog(), spec });
    expect(parsed.spec?.rows[0]?.trim_values?.[T]).toEqual({ en: "420 hp", ar: "٤٢٠ حصان" });
  });

  it("still parses without it (deploy before migration)", () => {
    expect(ShowroomCatalog.parse(demoCatalog()).spec).toBeUndefined();
  });

  it("refuses an unexpected key or a per-trim value that isn't exactly {en, ar}", () => {
    expect(() =>
      ShowroomCatalog.parse({ ...demoCatalog(), spec: { ...spec, extra: [] } }),
    ).toThrow();
    const leaky = structuredClone(spec);
    (leaky.rows[0]!.trim_values as Record<string, unknown>)[T] = { en: "x", ar: "y", cost: 1 };
    expect(() => ShowroomCatalog.parse({ ...demoCatalog(), spec: leaky })).toThrow();
    const badScope = structuredClone(spec);
    (badScope.rows[0] as { scope: string }).scope = "some_trims";
    expect(() => ShowroomCatalog.parse({ ...demoCatalog(), spec: badScope })).toThrow();
  });
});
