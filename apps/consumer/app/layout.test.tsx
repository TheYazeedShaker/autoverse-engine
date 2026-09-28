import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { LANG_HEADER } from "../lib/showroom/lang";

// The root layout sets <html lang dir> from the header proxy.ts passes it.

const state = vi.hoisted(() => ({ lang: null as string | null }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(state.lang === null ? {} : { [LANG_HEADER]: state.lang }),
}));

const html = async () => {
  const { default: RootLayout } = await import("./layout");
  return renderToStaticMarkup(await RootLayout({ children: <p>x</p> }));
};

describe("RootLayout", () => {
  it("is Arabic, right-to-left, when the proxy says ar", async () => {
    state.lang = "ar";
    expect(await html()).toContain('<html lang="ar" dir="rtl">');
  });

  it("is English, left-to-right, otherwise (en, anything else, or no header)", async () => {
    for (const lang of ["en", "fr", null]) {
      state.lang = lang;
      expect(await html()).toContain('<html lang="en" dir="ltr">');
    }
  });
});
