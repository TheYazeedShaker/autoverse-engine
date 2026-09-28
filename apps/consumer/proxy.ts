import { NextResponse, type NextRequest } from "next/server";
import { LANG_HEADER, langFrom } from "./lib/showroom/lang";

// Passes the page language (`?lang=`) to the root layout as a request header, so `<html lang dir>`
// matches the page (a layout can't read the query string). The header is always overwritten here,
// so a value a visitor sends themselves never reaches the layout.

export function proxy(request: NextRequest) {
  const headers = new Headers(request.headers);
  // Read the parameter exactly as the page does: a repeated `lang` reaches the page as an array
  // (English), so it must be English here too, or <html> and the page would disagree.
  const values = request.nextUrl.searchParams.getAll("lang");
  headers.set(LANG_HEADER, langFrom(values.length === 1 ? values[0] : values));
  return NextResponse.next({ request: { headers } });
}

export const config = {
  // Pages only: not Next's assets, API routes or files with an extension.
  matcher: ["/((?!_next/|api/|.*\\..*).*)"],
};
