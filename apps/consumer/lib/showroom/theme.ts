import type { BrandThemeRow } from "@autoverse/engine-core";

// The brand's theme as CSS custom properties, injected into <head> server-side (theming REV,
// "Data-access layer addition"). Only the accent family is themed. Surfaces, type, radius and
// motion are brand-invariant and come from @autoverse/tokens untouched.
//
// The values come from the database, where CHECK constraints guarantee the format and the AA
// pairs. They are checked again here anyway, because this string is written into a <style>
// element: a value that isn't a plain six-digit hex would be CSS injection, not a colour.

const HEX6 = /^#[0-9a-fA-F]{6}$/;

export type ThemeResult = { ok: true; css: string } | { ok: false; field: string };

/** Only the colour fields: a `brand_themes` row or the showroom read's theme object. */
export type ThemeColours = Pick<
  BrandThemeRow,
  "accent_hex" | "on_accent" | "hover_hex" | "muted_hex" | "focus_hex"
>;

export type LogoVariant = "light" | "dark";

/**
 * A theme logo ref, checked again on this side of the boundary (ADR 0024): the public-bucket key
 * {brand}/_brand/logo-{variant}.{hash8}.{svg|png}, in THIS brand's folder. Anything else is null, so
 * the page falls back to the brand-name wordmark rather than requesting an unexpected path.
 */
export function logoPath(
  ref: string | null,
  variant: LogoVariant,
  brandSlug: string,
): string | null {
  if (ref === null) return null;
  const m =
    /^([a-z0-9]+(?:-[a-z0-9]+)*)\/_brand\/logo-(light|dark)\.[0-9a-f]{8}\.(?:svg|png)$/.exec(ref);
  return m && m[1] === brandSlug && m[2] === variant ? ref : null;
}

export function themeCss(theme: ThemeColours): ThemeResult {
  const colours: [string, string, string][] = [
    ["--av-accent", "accent_hex", theme.accent_hex],
    ["--av-accent-hover", "hover_hex", theme.hover_hex],
    ["--av-accent-muted", "muted_hex", theme.muted_hex],
    ["--av-focus-ring", "focus_hex", theme.focus_hex],
  ];
  const declarations: string[] = [];
  for (const [prop, field, value] of colours) {
    if (!HEX6.test(value)) return { ok: false, field };
    declarations.push(`${prop}:${value.toLowerCase()}`);
  }
  // on_accent is 'black' | 'white' by CHECK; validate-theme measured the AA pairs against pure
  // black and white, so those exact keywords are what the page must use.
  if (theme.on_accent !== "black" && theme.on_accent !== "white") {
    return { ok: false, field: "on_accent" };
  }
  declarations.push(`--av-on-accent:${theme.on_accent}`);
  return { ok: true, css: `:root{${declarations.join(";")}}` };
}
