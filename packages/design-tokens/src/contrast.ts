// WCAG 2.1 relative-luminance + contrast-ratio math.
// Shared by the surface-pairing invariant test (§4.2) and the Color foundations story,
// so the "is this pair AA?" question has exactly one implementation.

/** Parse a #rgb or #rrggbb hex string to [r,g,b] in 0–255. Throws on anything else. */
export function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m || !m[1]) throw new Error(`Not a hex color: ${hex}`);
  let h = m[1];
  if (h.length === 3) {
    h = h[0]! + h[0]! + h[1]! + h[1]! + h[2]! + h[2]!;
  }
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** WCAG relative luminance of an sRGB hex color (0 = black, 1 = white). */
export function relativeLuminance(hex: string): number {
  const channel = (c: number): number => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio between two hex colors, from 1:1 to 21:1. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** WCAG AA thresholds. Normal text 4.5:1; large text / UI components 3:1. */
export const AA = { normal: 4.5, large: 3 } as const;

/** True when the pair meets AA for the given text size. */
export function meetsAA(fg: string, bg: string, size: keyof typeof AA = "normal"): boolean {
  return contrastRatio(fg, bg) >= AA[size];
}
