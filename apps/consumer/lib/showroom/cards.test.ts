import { describe, expect, it, vi } from "vitest";
import type { Logger } from "../log";
import { cardProps, sectionProps } from "./cards";
import { COPY } from "./copy";
import { demoCatalog } from "./fixtures/demo-catalog";
import { buildShowroom } from "./loader";

const view = () => buildShowroom(demoCatalog(), vi.fn() as unknown as Logger);

describe("sectionProps", () => {
  it("names the section by the model, anchored at its slug, with descriptor and from-price", () => {
    const v = view();
    expect(sectionProps(v.models[0]!, "en", v.market, COPY.en)).toEqual({
      id: "demo-suv",
      name: "Demo SUV",
      descriptor: "SUV · Petrol · AWD",
      price: expect.stringMatching(/^From EGP\s?3,900,000$/),
    });
  });

  it("says 'Price on request' (never 'From 0') when no trim has a price", () => {
    const v = view();
    expect(sectionProps(v.models[1]!, "en", v.market, COPY.en).price).toBe("Price on request");
  });

  it("is fully Arabic in AR: vocabulary labels and copy", () => {
    const v = view();
    const s = sectionProps(v.models[1]!, "ar", v.market, COPY.ar);
    expect(s.name).toBe("ديمو إي في");
    expect(s.descriptor).toBe("إس يو في · كهربائي · دفع خلفي");
    expect(s.price).toBe("السعر عند الطلب");
  });
});

describe("cardProps", () => {
  it("titles a trim by model + trim when the model has several, else by the model alone", () => {
    const v = view();
    const [suv, ev] = v.models;
    expect(cardProps(suv!, suv!.trims[1]!, "en", v.market, COPY.en).title).toBe("Demo SUV Sport");
    expect(cardProps(ev!, ev!.trims[0]!, "en", v.market, COPY.en).title).toBe("Demo EV");
  });

  it("maps attributes, stats and details from the resolved trim (overrides included)", () => {
    const v = view();
    const suv = v.models[0]!;
    const p = cardProps(suv, suv.trims[1]!, "en", v.market, COPY.en);
    expect(p.attributes).toEqual([
      { icon: "fuel", label: "Petrol" },
      { icon: "drive", label: "AWD" },
      { icon: "transmission", label: "8-speed automatic" },
    ]);
    expect(p.stats).toEqual([
      { icon: "accel", value: "5.9", unit: "s", label: "0 – 100 km/h" },
      { icon: "power", value: "460", unit: "hp", label: "Power" },
      { icon: "top-speed", value: "200", unit: "km/h", label: "Top speed" },
    ]);
    expect(p.details).toEqual([
      { icon: "pump", label: "Fuel consumption (combined)", value: "11.2 L/100km" },
      { icon: "seats", label: "Seating capacity", value: "7 seats" },
    ]);
    expect(p.price.value).toMatch(/EGP\s?4,400,000/);
    expect(p.id).toBe("demo-suv-sport");
  });

  it("formats numbers in the page's language", () => {
    const v = view();
    const suv = v.models[0]!;
    const p = cardProps(suv, suv.trims[0]!, "ar", v.market, COPY.ar);
    expect(p.stats[0]).toMatchObject({ value: "٦٫٤", unit: "ث", label: "0 – 100 كم/س" });
    expect(p.details[1]).toEqual({ icon: "seats", label: "عدد المقاعد", value: "٧ مقاعد" });
  });

  it("uses the right Arabic plural for the seat count (one, two, few, other)", () => {
    const n = (count: number) => COPY.ar.seats(String(count), count);
    expect(n(1)).toBe("مقعد واحد");
    expect(n(2)).toBe("مقعدان");
    expect(n(7)).toBe("7 مقاعد");
    expect(n(11)).toBe("11 مقعدًا");
    expect(COPY.en.seats("1", 1)).toBe("1 seat");
    expect(COPY.en.seats("7", 7)).toBe("7 seats");
  });

  it("leaves out a stat the data doesn't have, rather than showing a blank or 0", () => {
    const snap = demoCatalog();
    snap.models[0]!.top_speed_kph = null;
    const v = buildShowroom(snap, vi.fn() as unknown as Logger);
    const p = cardProps(v.models[0]!, v.models[0]!.trims[0]!, "en", v.market, COPY.en);
    expect(p.stats.map((s) => s.icon)).toEqual(["accel", "power"]);
  });

  it("an on-request trim shows 'Price on request' with no 'From'", () => {
    const v = view();
    const ev = v.models[1]!;
    expect(cardProps(ev, ev.trims[0]!, "en", v.market, COPY.en).price).toEqual({
      label: "",
      value: "Price on request",
    });
  });

  it("keeps Configure and Explore without a destination until their pages exist", () => {
    const v = view();
    const p = cardProps(v.models[0]!, v.models[0]!.trims[0]!, "en", v.market, COPY.en);
    expect(p.configure).toEqual({ label: "Configure" });
    expect(p.explore).toEqual({ label: "Explore in Detail" });
  });
});
