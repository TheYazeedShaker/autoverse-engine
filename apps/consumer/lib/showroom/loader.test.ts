import { describe, expect, it, vi } from "vitest";
import type { Logger } from "../log";
import { DEMO_IDS, demoCatalog } from "./fixtures/demo-catalog";
import { buildShowroom, formatPrice, lowestPrice, pickImage } from "./loader";

const quiet = (): Logger & { mock: { calls: unknown[][] } } => vi.fn() as never;
const events = (log: { mock: { calls: unknown[][] } }) => log.mock.calls.map((c) => c[1]);

describe("buildShowroom", () => {
  it("orders models by line-up, each with its trims in order", () => {
    const view = buildShowroom(demoCatalog(), quiet());
    expect(view.models.map((m) => m.slug)).toEqual(["demo-suv", "demo-ev"]);
    expect(view.models[0]!.trims.map((t) => t.slug)).toEqual(["base", "sport"]);
  });

  it("drops (and logs) a trim, price or asset that points outside the payload", () => {
    const log = quiet();
    const snap = demoCatalog();
    snap.trims.push({
      ...snap.trims[0]!,
      id: "00000000-0000-4000-8000-0000000000ff",
      slug: "stray",
      model_id: "00000000-0000-4000-8000-0000000000ee",
    });
    snap.prices.push({
      trim_id: "00000000-0000-4000-8000-0000000000dd",
      price_amount: 1,
      on_request: false,
    });
    snap.assets.push({ ...snap.assets[0]!, model_id: "00000000-0000-4000-8000-0000000000ee" });
    const view = buildShowroom(snap, log);
    expect(view.models.flatMap((m) => m.trims.map((t) => t.slug))).not.toContain("stray");
    const orphans = log.mock.calls.filter((c) => c[1] === "showroom_payload_orphan");
    expect(orphans.map((c) => (c[2] as { kind: string }).kind).sort()).toEqual([
      "asset",
      "price",
      "trim",
    ]);
  });

  it("resolves trim stats over the model's, overrides included, with drive as vocabulary", () => {
    const view = buildShowroom(demoCatalog(), quiet());
    const [base, sport] = view.models[0]!.trims;
    expect(base!.stats).toEqual({
      drive: { key: "awd", label: { en: "AWD", ar: "دفع كلي" } },
      seats: 7,
      accelS: 6.4,
      powerHp: 420,
      topSpeedKph: 200,
    });
    expect(sport!.stats.powerHp).toBe(460);
    expect(sport!.stats.accelS).toBe(5.9);
    expect(view.models[1]!.trims[0]!.stats.drive?.key).toBe("rwd");
  });

  it("labels attributes from the payload's vocabulary, in both languages", () => {
    const view = buildShowroom(demoCatalog(), quiet());
    const ev = view.models[1]!;
    expect(ev.fuel).toEqual({ key: "ev", label: { en: "Electric", ar: "كهربائي" } });
    expect(ev.body?.label.ar).toBe("إس يو في");
    expect(ev.transmission?.label.en).toBe("Single-speed");
  });

  it("shows an unknown key as itself and logs it once", () => {
    const log = quiet();
    const snap = demoCatalog();
    snap.models[0]!.body_type = "roadster";
    snap.models[1]!.body_type = "roadster";
    const view = buildShowroom(snap, log);
    expect(view.models[0]!.body).toEqual({
      key: "roadster",
      label: { en: "roadster", ar: "roadster" },
    });
    expect(events(log).filter((e) => e === "showroom_vocabulary_missing")).toHaveLength(1);
  });

  it("prices in the market currency, whatever it is, with the lowest trim as the from-price", () => {
    const view = buildShowroom(demoCatalog(), quiet());
    expect(view.models[0]!.fromPrice).toEqual({
      kind: "amount",
      amount: 3_900_000,
      currency: "EGP",
    });

    const sar = demoCatalog();
    sar.market.currency = "SAR";
    expect(buildShowroom(sar, quiet()).models[0]!.fromPrice).toEqual({
      kind: "amount",
      amount: 3_900_000,
      currency: "SAR",
    });
  });

  it("shows on-request, never 0, for an on-request trim or a missing price row", () => {
    const log = quiet();
    const snap = demoCatalog();
    snap.prices = snap.prices.filter((p) => p.trim_id !== DEMO_IDS.suvSport);
    const view = buildShowroom(snap, log);
    expect(view.models[1]!.trims[0]!.price).toEqual({ kind: "on_request" });
    expect(view.models[1]!.fromPrice).toEqual({ kind: "on_request" });
    expect(view.models[0]!.trims[1]!.price).toEqual({ kind: "on_request" });
    expect(events(log)).toContain("showroom_price_missing");
  });

  it("uses the trim's public image, falls back to the model's, and logs a missing one", () => {
    const log = quiet();
    const view = buildShowroom(demoCatalog(), log);
    const [base, sport] = view.models[0]!.trims;
    expect(base!.cardImage?.publicPath).toMatch(/b1-side\.png$/);
    expect(sport!.cardImage?.publicPath).toMatch(/all-side\.png$/);
    expect(sport!.heroImage).toBeNull();
    expect(log.mock.calls).toContainEqual([
      "warn",
      "showroom_asset_missing",
      { brand: "demo", model: "demo-suv", trim: "sport", view: "front-34" },
    ]);
  });

  it("skips a model with no trims, and logs it", () => {
    const log = quiet();
    const snap = demoCatalog();
    snap.trims = snap.trims.filter((t) => t.model_id !== DEMO_IDS.ev);
    const view = buildShowroom(snap, log);
    expect(view.models.map((m) => m.slug)).toEqual(["demo-suv"]);
    expect(events(log)).toContain("showroom_model_without_trims");
  });

  it("derives filter facets by vocabulary key, counting each model once per key", () => {
    const view = buildShowroom(demoCatalog(), quiet());
    expect(view.facets.body).toEqual([
      { value: "suv", label: { en: "SUV", ar: "إس يو في" }, count: 2 },
    ]);
    expect(view.facets.fuel.map((f) => [f.value, f.count])).toEqual([
      ["petrol", 1],
      ["ev", 1],
    ]);
    expect(view.facets.drive.map((f) => [f.value, f.count])).toEqual([
      ["awd", 1],
      ["rwd", 1],
    ]);
    expect(view.facets.seats.map((f) => [f.value, f.count])).toEqual([
      ["7", 1],
      ["5", 1],
    ]);
  });

  it("never logs a visitor's data: only slugs, codes, keys and views", () => {
    const log = quiet();
    const snap = demoCatalog();
    snap.assets = [];
    snap.models[0]!.body_type = "roadster";
    buildShowroom(snap, log);
    expect(log.mock.calls.length).toBeGreaterThan(0);
    for (const [, , fields] of log.mock.calls) {
      for (const key of Object.keys(fields as object)) {
        expect(["brand", "model", "trim", "view", "market", "currency", "kind", "key"]).toContain(
          key,
        );
      }
    }
  });
});

describe("pickImage", () => {
  it("matches model and view, preferring the trim's own image", () => {
    const { assets } = demoCatalog();
    expect(pickImage(assets, DEMO_IDS.suv, DEMO_IDS.suvBase, "side")?.publicPath).toMatch(
      /b1-side/,
    );
    expect(pickImage(assets, DEMO_IDS.suv, DEMO_IDS.suvSport, "side")?.publicPath).toMatch(
      /all-side/,
    );
    expect(pickImage(assets, DEMO_IDS.ev, DEMO_IDS.evLongRange, "front-34")).toBeNull();
  });
});

describe("lowestPrice / formatPrice", () => {
  const market = { code: "EG", currency: "EGP", locale: "ar-EG", rtl: false };

  it("on request when nothing has a price", () => {
    expect(lowestPrice([{ kind: "on_request" }])).toEqual({ kind: "on_request" });
    expect(lowestPrice([])).toEqual({ kind: "on_request" });
  });

  it("formats with the market currency in either language, and the on-request copy otherwise", () => {
    const price = { kind: "amount", amount: 3_900_000, currency: "EGP" } as const;
    expect(formatPrice(price, "en", market, "Price on request")).toMatch(/EGP\s?3,900,000/);
    expect(formatPrice(price, "ar", market, "السعر عند الطلب")).not.toMatch(/3,900,000/);
    expect(formatPrice({ kind: "on_request" }, "en", market, "Price on request")).toBe(
      "Price on request",
    );
  });
});
