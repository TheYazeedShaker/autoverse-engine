import { describe, expect, it } from "vitest";
import type { EngineDb, QueryBuilder, QueryResult, TableApi } from "./client";
import { EngineDbError } from "./client";
import type { ModelRow, SpecRowRow, TrimRow } from "./database.types";
import {
  BrandRepository,
  EventRepository,
  LeadRepository,
  ModelRepository,
  ThemeRepository,
  TrimRepository,
  resolveLedgerRow,
  rowDiffers,
} from "./repositories";

// A fake that records what each repository actually asked the database for. The point is to assert
// the brand filter is there: one missing .eq("brand_id", …) on a service-role call is a
// cross-tenant read, and it would never show up in a test that only checked the returned rows.
interface Call {
  table: string;
  op: "select" | "insert" | "update" | "upsert";
  filters: Array<[string, unknown]>;
  values?: unknown;
  onConflict?: string;
}

function fakeDb(rows: unknown[] = [], error: { message: string } | null = null) {
  const calls: Call[] = [];

  function builder(call: Call): QueryBuilder<never> {
    const result = { data: rows as never[], error } as QueryResult<never>;
    const self: QueryBuilder<never> = {
      select() {
        return self;
      },
      eq(column, value) {
        call.filters.push([column, value]);
        return self;
      },
      in(column, values) {
        call.filters.push([column, values]);
        return self;
      },
      order() {
        return self;
      },
      limit() {
        return self;
      },
      async maybeSingle() {
        return { data: (rows[0] ?? null) as never, error };
      },
      async single() {
        return { data: (rows[0] ?? null) as never, error };
      },
      then(onfulfilled) {
        return Promise.resolve(result).then(onfulfilled ?? undefined);
      },
    };
    return self;
  }

  const db: EngineDb = {
    from<Row>(table: string): TableApi<Row> {
      const make = (op: Call["op"], values?: unknown, onConflict?: string) => {
        const call: Call = { table, op, filters: [], values, onConflict };
        calls.push(call);
        return builder(call) as unknown as QueryBuilder<Row>;
      };
      return {
        select: () => make("select"),
        insert: (values) => make("insert", values),
        update: (values) => make("update", values),
        upsert: (values, opts) => make("upsert", values, opts?.onConflict),
      };
    },
  };

  return { db, calls };
}

const BRAND = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";

const brandFilter = (call: Call) => call.filters.find(([c]) => c === "brand_id")?.[1];

describe("brand scoping is applied by the repository, not by the caller", () => {
  it("scopes every read to the repository's brand", async () => {
    const { db, calls } = fakeDb([]);
    await new ModelRepository(db, BRAND).listPublished();
    await new ModelRepository(db, BRAND).getBySlug("a-pub");
    await new TrimRepository(db, BRAND).listForModel("model-1");
    await new LeadRepository(db, BRAND).listRecent();

    expect(calls).toHaveLength(4);
    for (const call of calls) expect(brandFilter(call)).toBe(BRAND);
  });

  it("stamps the brand on a captured lead rather than trusting the input", async () => {
    const { db, calls } = fakeDb([{ id: "lead-1" }]);
    await new LeadRepository(db, BRAND).create({
      market_code: "EG",
      full_name: "Fatma Hassan",
      phone: "+201000000001",
      consent_text_version: "eg-v1",
      consent_at: "2026-09-22T00:00:00.000Z",
      // A caller trying to write into another tenant cannot: brand_id is not part of LeadInput.
    });
    expect((calls[0]!.values as { brand_id: string }).brand_id).toBe(BRAND);
  });

  it("records an event idempotently, on the id the caller supplied", async () => {
    const { db, calls } = fakeDb([]);
    await new EventRepository(db, BRAND).record({ id: "event-1", kind: "configurator.opened" });
    expect(calls[0]!.op).toBe("upsert");
    expect(calls[0]!.onConflict).toBe("id");
    expect((calls[0]!.values as { brand_id: string }).brand_id).toBe(BRAND);
  });

  it("scopes marking an event processed to the brand as well as the id", async () => {
    const { db, calls } = fakeDb([]);
    await new EventRepository(db, BRAND).markProcessed("event-1", "2026-09-22T00:00:00.000Z");
    expect(brandFilter(calls[0]!)).toBe(BRAND);
    expect(calls[0]!.filters).toContainEqual(["id", "event-1"]);
  });

  it("refuses to exist without a brand", () => {
    const { db } = fakeDb([]);
    expect(() => new ModelRepository(db, "")).toThrow(/needs a brand id/);
  });

  it("keeps two repositories independent", async () => {
    const { db, calls } = fakeDb([]);
    await new ModelRepository(db, BRAND).listPublished();
    await new ModelRepository(db, OTHER).listPublished();
    expect(brandFilter(calls[0]!)).toBe(BRAND);
    expect(brandFilter(calls[1]!)).toBe(OTHER);
  });

  it("asks for a theme by brand AND market", async () => {
    // eslint-disable-next-line no-restricted-syntax -- a brand accent is tenant DATA, like car paint, not a design token
    const { db, calls } = fakeDb([{ accent_hex: "#0B3D2E" }]);
    await new ThemeRepository(db).getForBrand(BRAND, "EG");
    expect(calls[0]!.table).toBe("brand_themes");
    expect(calls[0]!.filters).toEqual([
      ["brand_id", BRAND],
      ["market_code", "EG"],
    ]);
  });

  it("surfaces a database error instead of returning an empty result", async () => {
    const { db } = fakeDb([], { message: "permission denied for table models" });
    await expect(new ModelRepository(db, BRAND).listPublished()).rejects.toBeInstanceOf(
      EngineDbError,
    );
    await expect(new BrandRepository(db).getBySlug("brand-a")).rejects.toThrow(/permission denied/);
  });
});

describe("trim stats resolve against the model", () => {
  const model = {
    seats: 5,
    accel_0_100_s: 8.1,
    power_hp: 190,
    top_speed_kph: 210,
    torque_nm: 300,
  } as ModelRow;

  it("inherits what the trim does not override", () => {
    const trim = {
      seats: null,
      accel_0_100_s: null,
      power_hp: 240,
      top_speed_kph: null,
      torque_nm: null,
    } as TrimRow;
    const { db } = fakeDb([]);
    expect(new TrimRepository(db, BRAND).resolveStats(model, trim)).toEqual({
      seats: 5,
      accel_0_100_s: 8.1,
      power_hp: 240,
      top_speed_kph: 210,
      torque_nm: 300,
    });
  });

  it("treats a zero override as a value, not as missing", () => {
    const trim = {
      seats: 0,
      accel_0_100_s: null,
      power_hp: null,
      top_speed_kph: null,
      torque_nm: null,
    } as TrimRow;
    const { db } = fakeDb([]);
    expect(new TrimRepository(db, BRAND).resolveStats(model, trim).seats).toBe(0);
  });
});

describe("spec ledger helpers", () => {
  const allTrims = {
    scope: "all_trims",
    value_en: "8-speed automatic",
    value_ar: "أوتوماتيك",
    trim_values: null,
  } as SpecRowRow;

  const perTrim = {
    scope: "per_trim",
    value_en: null,
    value_ar: null,
    trim_values: {
      "trim-a": { en: "190 hp", ar: "190 حصان" },
      "trim-b": { en: "240 hp", ar: "240 حصان" },
    },
  } as unknown as SpecRowRow;

  it("gives every trim the shared value on an all-trims row", () => {
    expect(resolveLedgerRow(allTrims, "trim-a")).toEqual({
      en: "8-speed automatic",
      ar: "أوتوماتيك",
    });
    expect(resolveLedgerRow(allTrims, "anything")).toEqual(resolveLedgerRow(allTrims, "trim-a"));
  });

  it("gives each trim its own value on a per-trim row", () => {
    expect(resolveLedgerRow(perTrim, "trim-b")).toEqual({ en: "240 hp", ar: "240 حصان" });
  });

  it("returns null when a per-trim row has nothing for that trim", () => {
    expect(resolveLedgerRow(perTrim, "trim-c")).toBeNull();
  });

  it("derives 'differs across trims' rather than storing it", () => {
    expect(rowDiffers(allTrims)).toBe(false);
    expect(rowDiffers(perTrim)).toBe(true);
  });

  it("does not call identical per-trim values a difference", () => {
    const same = {
      scope: "per_trim",
      value_en: null,
      value_ar: null,
      trim_values: {
        "trim-a": { en: "190 hp", ar: "190 حصان" },
        "trim-b": { en: "190 hp", ar: "190 حصان" },
      },
    } as unknown as SpecRowRow;
    expect(rowDiffers(same)).toBe(false);
  });

  it("does not call a single-trim row a difference", () => {
    const one = {
      scope: "per_trim",
      value_en: null,
      value_ar: null,
      trim_values: { "trim-a": { en: "190 hp", ar: "190 حصان" } },
    } as unknown as SpecRowRow;
    expect(rowDiffers(one)).toBe(false);
  });
});
