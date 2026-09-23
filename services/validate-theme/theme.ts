// Theme derivation and the AA gate. Pure functions, no Deno or network APIs, so they are unit
// tested by vitest and reused by the edge handler in index.ts.
//
// A brand picks ONE value: the accent. Everything else — the text colour that sits on it, the hover
// and muted shades, the focus ring — is derived here, server-side. The client never computes these,
// so two surfaces can never disagree about what a brand's accent means.

export const CANVAS_MIST = "#F4F7F5";
export const WHITE = "#FFFFFF";
export const BLACK = "#000000";
export const AA_NORMAL = 4.5;

export interface DerivedTheme {
  accent_hex: string;
  on_accent: "black" | "white";
  hover_hex: string;
  muted_hex: string;
  focus_hex: string;
}

export interface AaFailure {
  pair: string;
  ratio: number;
  required: number;
}

const HEX = /^#[0-9A-Fa-f]{6}$/;

export function isHex(value: string): boolean {
  return HEX.test(value);
}

function toRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

function toHex([r, g, b]: [number, number, number]): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return `#${[r, g, b].map((v) => clamp(v).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

function channelLuminance(v: number): number {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** WCAG relative luminance. Mirrors app_auth.relative_luminance in the theming migration. */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = toRgb(hex);
  return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b);
}

/** WCAG contrast ratio, 1–21. Mirrors app_auth.contrast_ratio. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function mix(from: string, to: string, amount: number): string {
  const [r1, g1, b1] = toRgb(from);
  const [r2, g2, b2] = toRgb(to);
  return toHex([r1 + (r2 - r1) * amount, g1 + (g2 - g1) * amount, b1 + (b2 - b1) * amount]);
}

/**
 * Derive the full theme from an accent.
 *
 * - on_accent: whichever of black/white reads better ON the accent.
 * - hover: a step away from the LABEL colour — darker under a white label, lighter under a black
 *   one — so hovering always increases contrast with the label, never reduces it.
 * - muted: the accent barely tinting the Mist canvas, for card wedges and washes.
 * - focus: the accent pushed until the ring is visible against the canvas (≥ 3:1), because a focus
 *   ring nobody can see is a keyboard trap.
 */
export function deriveTheme(accentHex: string): DerivedTheme {
  const accent = accentHex.toUpperCase();
  const onAccent: "black" | "white" =
    contrastRatio(BLACK, accent) >= contrastRatio(WHITE, accent) ? "black" : "white";

  // Hover moves AWAY from the label colour, never towards it: a white-labelled accent darkens, a
  // black-labelled one lightens. Either way contrast with on_accent grows, so hovering can never
  // make a button harder to read than resting does.
  const hover = onAccent === "white" ? mix(accent, BLACK, 0.12) : mix(accent, WHITE, 0.12);

  const muted = mix(CANVAS_MIST, accent, 0.12);

  let focus = accent;
  for (let step = 0; step < 10 && contrastRatio(focus, CANVAS_MIST) < 3; step += 1) {
    focus = mix(focus, BLACK, 0.1);
  }

  return {
    accent_hex: accent,
    on_accent: onAccent,
    hover_hex: hover,
    muted_hex: muted,
    focus_hex: focus,
  };
}

/**
 * The AA gate from the theming REV. Returns every failing pair, named, so the caller can tell the
 * operator exactly which one to fix instead of "invalid colour".
 */
export function checkAa(theme: DerivedTheme): AaFailure[] {
  const onAccentHex = theme.on_accent === "black" ? BLACK : WHITE;
  const pairs: Array<[string, string, string]> = [
    ["on-accent on accent", onAccentHex, theme.accent_hex],
    ["on-accent on hover", onAccentHex, theme.hover_hex],
    ["accent text on the Mist canvas", theme.accent_hex, CANVAS_MIST],
    ["accent text on a white surface", theme.accent_hex, WHITE],
  ];
  return pairs
    .map(([pair, a, b]) => ({ pair, ratio: contrastRatio(a, b), required: AA_NORMAL }))
    .filter((r) => r.ratio < AA_NORMAL);
}

export interface ValidateThemeRequest {
  brand_id: string;
  market_code: string;
  accent_hex: string;
}

export type ValidateThemeResult =
  | { ok: true; theme: DerivedTheme }
  | { ok: false; status: 400 | 422; error: string; failures?: AaFailure[] };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MARKET = /^[A-Z]{2}$/;

/** Validate the request shape, derive, then gate on AA. No database access — that is the caller's. */
export function validateThemeRequest(body: unknown): ValidateThemeResult {
  const b = body as Partial<ValidateThemeRequest> | null;
  if (!b || typeof b !== "object") {
    return { ok: false, status: 400, error: "Body must be a JSON object." };
  }
  if (typeof b.brand_id !== "string" || !UUID.test(b.brand_id)) {
    return { ok: false, status: 400, error: "brand_id must be a uuid." };
  }
  if (typeof b.market_code !== "string" || !MARKET.test(b.market_code)) {
    return { ok: false, status: 400, error: "market_code must be a two-letter ISO country code." };
  }
  if (typeof b.accent_hex !== "string" || !isHex(b.accent_hex)) {
    return { ok: false, status: 400, error: "accent_hex must be a #RRGGBB colour." };
  }

  const theme = deriveTheme(b.accent_hex);
  const failures = checkAa(theme);
  if (failures.length > 0) {
    const named = failures
      .map((f) => `${f.pair} is ${f.ratio.toFixed(2)}:1, needs ${f.required}:1`)
      .join("; ");
    return { ok: false, status: 422, error: `Accent fails contrast: ${named}.`, failures };
  }
  return { ok: true, theme };
}
