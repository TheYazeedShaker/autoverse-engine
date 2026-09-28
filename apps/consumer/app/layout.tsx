import { headers } from "next/headers";
import type { ReactNode } from "react";
import { dirOf, LANG_HEADER, langFrom } from "../lib/showroom/lang";
import "./globals.css";

export const metadata = { title: "Consumer" };

// `<html lang dir>` follows the page language (spec §8), which proxy.ts passes in a request header.
export default async function RootLayout({ children }: { children: ReactNode }) {
  const lang = langFrom((await headers()).get(LANG_HEADER));
  return (
    <html lang={lang} dir={dirOf(lang)}>
      <body>{children}</body>
    </html>
  );
}
