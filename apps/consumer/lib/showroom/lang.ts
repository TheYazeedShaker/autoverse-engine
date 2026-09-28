import type { Lang } from "./copy";

// The page language (spec §8). `?lang=ar` renders Arabic/RTL; anything else is English. The TopBar's
// EN/AR switch links to these two. The proxy (proxy.ts) copies the choice into a request header so
// the root layout can set `<html lang dir>`, which a layout can't read from the query itself.

export const LANG_HEADER = "x-av-lang";

export function langFrom(value: string | string[] | null | undefined): Lang {
  return value === "ar" ? "ar" : "en";
}

export function dirOf(lang: Lang): "ltr" | "rtl" {
  return lang === "ar" ? "rtl" : "ltr";
}
