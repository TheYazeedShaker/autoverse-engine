import { describe, expect, it } from "vitest";
import { buildShowroom } from "../showroom/loader";
import { demoCatalog } from "../showroom/fixtures/demo-catalog";
import { captureUrlFrom, leadConfig } from "./config";
import { whatsappHref } from "./phone";

const KEY = "pk_" + "A".repeat(32);
const SITE = "1x00000000000000000000AA";
const ENV = { supabaseUrl: "https://project.supabase.example", siteKey: SITE };
const silent = () => {};

const showroom = (patch: Record<string, unknown> = {}) =>
  buildShowroom(
    { ...demoCatalog(), capture_key: KEY, ...patch } as ReturnType<typeof demoCatalog>,
    silent,
  );

describe("leadConfig", () => {
  it("is ready with a consent text, a key, a site key and a capture URL", () => {
    const r = leadConfig(showroom(), "en", ENV, whatsappHref);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.config).toMatchObject({
      captureUrl: "https://project.supabase.example/functions/v1/capture-lead",
      captureKey: KEY,
      marketCode: "EG",
      siteKey: SITE,
      consentVersion: "eg-v1",
      brandName: "Demo Motors",
    });
    // {Brand} is filled with the brand's name; no placeholder reaches the visitor.
    expect(r.config.consentText).toMatch(/^I agree that Demo Motors and its authorised dealers/);
    expect(r.config.consentText).not.toContain("{Brand}");
  });

  it("fills {Brand} literally, even with a $ in the brand name", () => {
    const name = "Cash $& Carry $$";
    const s = showroom({ brand: { slug: "demo", name } });
    const r = leadConfig(s, "en", ENV, whatsappHref);
    expect(r.ok && r.config.consentText.startsWith(`I agree that ${name} and its`)).toBe(true);
  });

  it("serves the consent text in the page's language", () => {
    const r = leadConfig(showroom(), "ar", ENV, whatsappHref);
    expect(r.ok && r.config.consentText.startsWith("أوافق على أن تتواصل معي Demo Motors")).toBe(
      true,
    );
  });

  it("maps cities and the WhatsApp number for the page's language", () => {
    const s = showroom({
      market: {
        ...demoCatalog().market,
        whatsapp_number: "+20 100 000 0000",
        lead_cities: [{ id: "cairo", en: "Cairo", ar: "القاهرة" }],
      },
    });
    const r = leadConfig(s, "ar", ENV, whatsappHref);
    expect(r.ok && r.config.cities).toEqual([{ id: "cairo", label: "القاهرة" }]);
    expect(r.ok && r.config.whatsappHref).toBe("https://wa.me/201000000000");
  });

  it.each([
    [{ lead_consent: null }, ENV, "no_consent_text"],
    [{ capture_key: null }, ENV, "no_capture_key"],
    [{}, { ...ENV, siteKey: undefined }, "no_site_key"],
    [{}, { ...ENV, siteKey: "not a key!" }, "no_site_key"],
    [{}, { ...ENV, supabaseUrl: undefined }, "no_capture_url"],
    [{}, { ...ENV, supabaseUrl: "http://project.supabase.example" }, "no_capture_url"],
  ] as const)("fails closed: %j %j → %s", (patch, env, reason) => {
    expect(leadConfig(showroom(patch), "en", env, whatsappHref)).toEqual({ ok: false, reason });
  });
});

describe("captureUrlFrom", () => {
  it("allows plain http only on this machine", () => {
    expect(captureUrlFrom("http://127.0.0.1:54321")).toBe(
      "http://127.0.0.1:54321/functions/v1/capture-lead",
    );
    expect(captureUrlFrom("http://example.com")).toBeNull();
    expect(captureUrlFrom("not a url")).toBeNull();
  });
});
