import { describe, expect, it, vi } from "vitest";
import type { Logger } from "../log";
import { demoCatalog } from "./fixtures/demo-catalog";
import { buildShowroom, formatPrice, lowestPrice, pickImage } from "./loader";

const quiet = (): Logger & { mock: { calls: unknown[][] } } => vi.fn() as never;
const events = (log: { mock: { calls: unknown[][] } }) => log.mock.calls.map((c) => c[1]);

describe("buildShowroom", () => {
  it("keeps published models only, in line-up order, each with its published trims", () => {
    const view = buildShowroom(demoCatalog(), quiet())!;
    expect(view.models.map((m) => m.slug)).toEqual(["demo-suv", "demo-ev"]);
    expect(view.models[0]!.trims.map((t) => t.slug)).toEqual(["base", "sport"]);
  });

  it("drops a draft trim and a trim of another brand", () => {
    const snap = demoCatalog();
    snap.trims[1] = { ...snap.trims[1]!, publish_state: "ready" };
    snap.trims.push({ ...snap.trims[0]!, id: "x", slug: "stray", brand_id: "other-brand" });
    const view = buildShowroom(snap, quiet())!;
    expect(view.models[0]!.trims.map((t) => t.slug)).toEqual(["base"]);
  });

  it("is null for a brand that isn't live or a market that isn't live", () => {
    const paused = demoCatalog();
    paused.brand.status = "paused";
    expect(buildShowroom(paused, quiet())).toBeNull();
    const dormant = demoCatalog();
    dormant.market.live = false;
    expect(buildShowroom(dormant, quiet())).toBeNull();
    const mismatched = demoCatalog();
    mismatched.market.brand_id = "someone-else";
    expect(buildShowroom(mismatched, quiet())).toBeNull();
  });

  it("resolves trim stats over the model's, overrides included", () => {
    const view = buildShowroom(demoCatalog(), quiet())!;
    const [base, sport] = view.models[0]!.trims;
    expect(base!.stats).toEqual({
      drive: "AWD",
      seats: 7,
      accelS: 6.4,
      powerHp: 420,
      topSpeedKph: 200,
    });
    expect(sport!.stats.powerHp).toBe(460);
    expect(sport!.stats.accelS).toBe(5.9);
    expect(view.models[1]!.trims[0]!.stats.drive).toBe("RWD");
  });

  it("prices in the market currency, with the lowest trim as the from-price", () => {
    const view = buildShowroom(demoCatalog(), quiet())!;
    expect(view.models[0]!.fromPrice).toEqual({
      kind: "amount",
      amount: 3_900_000,
      currency: "EGP",
    });
  });

  it("shows on-request, never 0, for an on-request trim or a missing price row", () => {
    const log = quiet();
    const snap = demoCatalog();
    snap.prices = snap.prices.filter((p) => p.trim_id !== snap.trims[1]!.id);
    const view = buildShowroom(snap, log)!;
    expect(view.models[1]!.trims[0]!.price).toEqual({ kind: "on_request" });
    expect(view.models[1]!.fromPrice).toEqual({ kind: "on_request" });
    expect(view.models[0]!.trims[1]!.price).toEqual({ kind: "on_request" });
    expect(events(log)).toContain("showroom_price_missing");
  });

  it("prints no price in a non-EGP market while the column is price_egp, and says so", () => {
    const log = quiet();
    const snap = demoCatalog();
    snap.market.currency = "SAR";
    const view = buildShowroom(snap, log)!;
    expect(view.models.flatMap((m) => m.trims.map((t) => t.price.kind))).toEqual([
      "on_request",
      "on_request",
      "on_request",
    ]);
    expect(events(log)).toContain("showroom_price_currency_unsupported");
  });

  it("uses the trim's image, falls back to the model's, and logs a missing one", () => {
    const log = quiet();
    const view = buildShowroom(demoCatalog(), log)!;
    const [base, sport] = view.models[0]!.trims;
    expect(base!.cardImage?.storagePath).toMatch(/b1-side\.png$/);
    expect(sport!.cardImage?.storagePath).toMatch(/all-side\.png$/);
    expect(sport!.heroImage).toBeNull();
    const missing = log.mock.calls.filter((c) => c[1] === "showroom_asset_missing");
    expect(missing).toContainEqual([
      "warn",
      "showroom_asset_missing",
      { brand: "demo", model: "demo-suv", trim: "sport", view: "front-34" },
    ]);
  });

  it("skips a published model with no published trims, and logs it", () => {
    const log = quiet();
    const snap = demoCatalog();
    snap.trims = snap.trims.filter((t) => t.model_id !== snap.models[1]!.id);
    const view = buildShowroom(snap, log)!;
    expect(view.models.map((m) => m.slug)).toEqual(["demo-suv"]);
    expect(events(log)).toContain("showroom_model_without_trims");
  });

  it("derives filter facets from data, counting each model once per value", () => {
    const view = buildShowroom(demoCatalog(), quiet())!;
    expect(view.facets).toEqual({
      body: [{ value: "SUV", count: 2 }],
      fuel: [
        { value: "Petrol", count: 1 },
        { value: "EV", count: 1 },
      ],
      drive: [
        { value: "AWD", count: 1 },
        { value: "RWD", count: 1 },
      ],
      seats: [
        { value: "7", count: 1 },
        { value: "5", count: 1 },
      ],
    });
  });

  it("never logs a visitor's data: only slugs, codes and views", () => {
    const log = quiet();
    const snap = demoCatalog();
    snap.assets = [];
    buildShowroom(snap, log);
    expect(log.mock.calls.length).toBeGreaterThan(0);
    for (const [, , fields] of log.mock.calls) {
      for (const key of Object.keys(fields as object)) {
        expect(["brand", "model", "trim", "view", "market", "currency"]).toContain(key);
      }
    }
  });
});

describe("pickImage", () => {
  it("ignores non-image kinds and other brands", () => {
    const snap = demoCatalog();
    const m = snap.models[0]!;
    const t = snap.trims[0]!;
    const video = { ...snap.assets[0]!, kind: "banner_video" as const };
    const foreign = { ...snap.assets[0]!, brand_id: "other" };
    expect(pickImage([video, foreign], m, t, "side")).toBeNull();
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
