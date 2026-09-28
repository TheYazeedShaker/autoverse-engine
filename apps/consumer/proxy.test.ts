import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { LANG_HEADER, dirOf, langFrom } from "./lib/showroom/lang";
import { proxy } from "./proxy";

const forwarded = (url: string, init?: ConstructorParameters<typeof NextRequest>[1]) => {
  const res = proxy(new NextRequest(url, init));
  // NextResponse.next({ request: { headers } }) forwards overridden request headers like this.
  return res.headers.get(`x-middleware-request-${LANG_HEADER}`);
};

describe("page language", () => {
  it("is Arabic only for ?lang=ar; English otherwise", () => {
    expect(langFrom("ar")).toBe("ar");
    expect(langFrom("en")).toBe("en");
    expect(langFrom("fr")).toBe("en");
    expect(langFrom(null)).toBe("en");
    expect(langFrom(["ar"])).toBe("en");
    expect(dirOf("ar")).toBe("rtl");
    expect(dirOf("en")).toBe("ltr");
  });

  it("the proxy passes it to the layout, overwriting any header the visitor sent", () => {
    expect(forwarded("https://demo.example.test/?lang=ar")).toBe("ar");
    expect(forwarded("https://demo.example.test/")).toBe("en");
    // A repeated parameter reaches the page as an array (English): the layout must agree.
    expect(forwarded("https://demo.example.test/?lang=ar&lang=en")).toBe("en");
    expect(forwarded("https://demo.example.test/?lang=ar&lang=ar")).toBe("en");
    expect(forwarded("https://demo.example.test/", { headers: { [LANG_HEADER]: "ar" } })).toBe(
      "en",
    );
  });
});
