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

// Slice 7 (migration 20260928140000; test 0026 asserts the same shapes on the database side).
describe("ShowroomCatalog: lead consent and capture key", () => {
  const KEY = "pk_" + "A".repeat(32);
  const consent = {
    version: "eg-v1",
    en: "I agree that {Brand} may call me.",
    ar: "أوافق {Brand}.",
  };

  it("parses the fixture, which carries the EG consent text and no key", () => {
    const parsed = ShowroomCatalog.parse(demoCatalog());
    expect(parsed.lead_consent?.version).toBe("eg-v1");
    expect(parsed.capture_key).toBeNull();
  });

  it("parses a consent text and a key, and each as null", () => {
    expect(
      ShowroomCatalog.parse({ ...demoCatalog(), lead_consent: consent, capture_key: KEY })
        .capture_key,
    ).toBe(KEY);
    const none = ShowroomCatalog.parse({ ...demoCatalog(), lead_consent: null, capture_key: null });
    expect(none.lead_consent).toBeNull();
    expect(none.capture_key).toBeNull();
  });

  it("still parses without either key (deploy before migration)", () => {
    const before: Record<string, unknown> = { ...demoCatalog() };
    delete before.lead_consent;
    delete before.capture_key;
    expect(ShowroomCatalog.safeParse(before).success).toBe(true);
  });

  it("refuses a malformed key or an extra field on the consent text", () => {
    const ok = (patch: Record<string, unknown>) =>
      ShowroomCatalog.safeParse({ ...demoCatalog(), ...patch }).success;
    expect(ok({ capture_key: "sk_live_" + "A".repeat(32) })).toBe(false);
    expect(ok({ capture_key: "pk_short" })).toBe(false);
  });

  it("turns a consent text it can't accept into null (no lead CTAs), never a failed catalogue", () => {
    const consentOf = (patch: Record<string, unknown>) =>
      ShowroomCatalog.parse({ ...demoCatalog(), lead_consent: { ...consent, ...patch } })
        .lead_consent;
    expect(consentOf({ en: "I agree that {brand} may call." })).toBeNull();
    expect(consentOf({ ar: "\n\t " })).toBeNull();
    expect(consentOf({ en: "a".repeat(2001) })).toBeNull();
    expect(consentOf({ version: "EG V1" })).toBeNull();
    expect(consentOf({ published_at: "2026-09-28" })).toBeNull();
    // 2000 characters counted as code points, as Postgres counts: 2000 emoji are 4000 UTF-16 units.
    expect(consentOf({ en: "😀".repeat(2000) })?.en).toHaveLength(4000);
  });
});
