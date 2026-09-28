import { describe, expect, it } from "vitest";
import { normalizePhone, whatsappHref } from "./phone";

describe("normalizePhone: EG mobiles", () => {
  it.each([
    ["01012345678", "+201012345678"],
    ["010 1234 5678", "+201012345678"],
    ["0111-234-5678", "+201112345678"],
    ["+20 12 3456 7890", "+201234567890"],
    ["00201512345678", "+201512345678"],
    ["1012345678", "+201012345678"],
    ["٠١٠١٢٣٤٥٦٧٨", "+201012345678"],
    ["۰۱۰۱۲۳۴۵۶۷۸", "+201012345678"],
    ["(010) 1234.5678", "+201012345678"],
  ])("%s → %s", (input, e164) => {
    expect(normalizePhone(input, "EG")).toEqual({ ok: true, e164 });
  });

  it.each([
    ["0131234567"], // not a mobile prefix
    ["0101234567"], // too short
    ["010123456789"], // too long
    ["0223456789"], // a Cairo landline
    ["+971501234567"], // another country
    ["phone"],
    [""],
  ])("refuses %s", (input) => {
    expect(normalizePhone(input, "EG")).toEqual({ ok: false });
  });
});

describe("normalizePhone: other markets", () => {
  it("takes an international number and refuses a local one", () => {
    expect(normalizePhone("+971 50 123 4567", "AE")).toEqual({ ok: true, e164: "+971501234567" });
    expect(normalizePhone("050 123 4567", "AE")).toEqual({ ok: false });
  });
});

describe("whatsappHref", () => {
  it("builds a wa.me link from the brand-market's number", () => {
    expect(whatsappHref("+20 100 000 0000")).toBe("https://wa.me/201000000000");
    expect(whatsappHref("00201000000000")).toBe("https://wa.me/201000000000");
  });

  it("is null for no number or an unusable one", () => {
    expect(whatsappHref(null)).toBeNull();
    expect(whatsappHref("")).toBeNull();
    expect(whatsappHref("12")).toBeNull();
    expect(whatsappHref("javascript:alert(1)")).toBeNull();
  });
});
