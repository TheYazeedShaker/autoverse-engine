// Typed mirror of tokens.css — the single source of truth for design tokens in TS/JS
// (component authoring, the Color story's live ratios, the RN bridge later).
// tokens.css is canonical for the web; keep the two in sync.

/* ============================ Neutral palette (locked, monochrome) ============================ */
export const palette = {
  white: "#FFFFFF", // the vehicle card (showroom): owner decision 2026-09-27, ADR 0021
  mist: "#F4F7F5", // lightest surface / canvas
  panel: "#ECEFEE", // raised panel
  card: "#E1E5E3", // card edge / deepest light
  onyx: "#08090A", // primary ink
  inkSoft: "#3C4044", // body / secondary ink
  slate: "#575A5E", // tertiary / muted ink on light
  platinum: "#A7A2A9", // accent-on-dark / metallic
  line: "#DBE0DD", // hairline
  lineSoft: "#E7EAE9",
  gunmetal: "#222823", // dark surface
  gunmetal2: "#2A312B",
  gunmetalLine: "#3A413B",
  onDark: "#F4F7F5",
  onDarkMute: "#9AA19D", // muted ink on dark (AA on gunmetal)
  onDarkSoft: "#CFD3D1", // secondary ink on dark (the dock's idle pills; tokens.css --av-on-dark-soft)

  // Admin ramp (REV2). The operator portal runs denser and darker than the consumer surfaces, so it
  // gets its own neutrals rather than bending the consumer ones. The same pairing rule applies.
  adminSidebar: "#101113",
  adminBase: "#0D0E10",
  adminSurface: "#15171A",
  adminRaised: "#1B1D20",
  onAdmin: "#F2F4F5",
  onAdminMute: "#9BA3AA", // lightened until it clears AA on the lightest admin surface
} as const;

/* ============================ Status sub-palette (muted, feedback-only) ============================
   The locked palette is chromatic-free; these desaturated state colors are used ONLY for feedback
   (form validation, Alert, Badge) — never as a brand accent. Each pairs with the §4.2 rule below.
   Decision recorded in ADR-0005. */
export const status = {
  // solids — for borders / icons / strong state text on the light canvas (meet AA-large ≥ 3:1)
  error: "#A1383D",
  success: "#2E6A47",
  warning: "#7C5A14",
  info: "#2F5468",
} as const;

/* ============================ Surfaces ↔ foreground (the contrast rule, in data) ============================
   §4.2: a surface is its OWN variant that carries its required foreground. Every registered surface
   MUST declare a non-null `fg` and `fgMute`, and each (bg,fg)/(bg,fgMute) pair MUST meet WCAG AA —
   enforced by surfaces.test.ts. A dark surface is never a `.dark` modifier over a light-assuming base. */
export interface Surface {
  readonly bg: string;
  readonly fg: string;
  readonly fgMute: string;
}

export const surfaces = {
  // neutral
  light: { bg: palette.mist, fg: palette.onyx, fgMute: palette.slate },
  panel: { bg: palette.panel, fg: palette.onyx, fgMute: palette.slate },
  card: { bg: palette.card, fg: palette.onyx, fgMute: palette.slate },
  // The vehicle card. A brand accent is validated against white (validate-theme), so accents may sit on it.
  white: { bg: palette.white, fg: palette.onyx, fgMute: palette.slate },
  dark: { bg: palette.gunmetal, fg: palette.onDark, fgMute: palette.onDarkMute },
  // admin — dark operator chrome (REV2). The light equivalents reuse the consumer neutrals rather
  // than inventing a second light ramp: an operator on a light theme sees the same greys as everyone.
  adminSidebar: { bg: palette.adminSidebar, fg: palette.onAdmin, fgMute: palette.onAdminMute },
  adminBase: { bg: palette.adminBase, fg: palette.onAdmin, fgMute: palette.onAdminMute },
  adminSurface: { bg: palette.adminSurface, fg: palette.onAdmin, fgMute: palette.onAdminMute },
  adminRaised: { bg: palette.adminRaised, fg: palette.onAdmin, fgMute: palette.onAdminMute },
  adminLight: { bg: palette.mist, fg: palette.onyx, fgMute: palette.slate },
  adminLightRaised: { bg: palette.panel, fg: palette.onyx, fgMute: palette.slate },
  // status — subtle tints carrying a readable dark foreground
  errorSubtle: { bg: "#F6E7E8", fg: "#7E2B2F", fgMute: "#8C3539" },
  successSubtle: { bg: "#E6EFE9", fg: "#1F5235", fgMute: "#285E3E" },
  warningSubtle: { bg: "#F5EDDC", fg: "#5E4310", fgMute: "#6E4F16" },
  infoSubtle: { bg: "#E5ECF1", fg: "#21424F", fgMute: "#2A4E5C" },
} as const satisfies Record<string, Surface>;

export type SurfaceName = keyof typeof surfaces;

/* Contextual foreground/background — the per-surface "current ink + current canvas" pair (§7). Every
   surface context sets `--av-fg` / `--av-fg-muted` / `--av-bg` (see tokens.css `:root` default + the
   `Surface` component / Storybook themes). Components that must INVERT with their surface read these:
   a primary Button fills with `--av-fg` and paints its label in `--av-bg`, so it is dark-on-light on a
   light surface and light-on-dark on a dark one — never dark-on-dark. The values always resolve to an
   already-AA surface pair, so the contrast rule stays structural. */
export const contextual = {
  fg: "var(--av-fg)",
  fgMuted: "var(--av-fg-muted)",
  bg: "var(--av-bg)",
} as const;

/* ============================ Type ============================ */
export const fonts = {
  en: '"Google Sans Flex", "Google Sans", system-ui, -apple-system, "Segoe UI", sans-serif',
  ar: '"Cairo", "Google Sans Flex", sans-serif',
  mono: 'ui-monospace, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
} as const;

export const text = {
  xs: "0.75rem",
  sm: "0.875rem",
  base: "1rem",
  lg: "1.125rem",
  xl: "1.375rem",
  "2xl": "1.75rem",
  "3xl": "2.25rem",
  "4xl": "3rem",
} as const;

/* ============================ Scales ============================ */
// Spacing on a 4px base, keyed by px value (§4.1).
export const space = {
  2: 2,
  4: 4,
  8: 8,
  12: 12,
  16: 16,
  20: 20,
  24: 24,
  32: 32,
  40: 40,
  48: 48,
  64: 64,
} as const;

// Radius (§4.1).
export const radius = { sm: 7, md: 10, lg: 14, xl: 18, "2xl": 28, pill: 999 } as const;

// Car framing (ADR 0022). The share of each fixed box's width the car fills, centred and bottom-aligned:
// side (2:1; cards and the drawer) and hero (16:9, front three-quarter). The same 80% in both, so a car
// keeps the same margin in every box.
export const carFrame = { sideFill: 0.8, heroFill: 0.8 } as const;

// The hero carousel: each slide's share of the stage width from `md` (a 4% neighbour peek each side; spec
// §5.3). Below `md` a slide is full width.
export const heroCarousel = { slide: 0.92 } as const;

// The showroom top bar's height (px). The hero fills the screen below it.
export const topBar = { height: 64 } as const;

// Border width. One hairline, used with --av-border for every divider and outline.
export const borderWidth = { hairline: 1 } as const;

// Elevation — soft, low-contrast shadows tuned for the Mist canvas (premium, not heavy).
export const elevation = {
  sm: "0 1px 2px rgba(8, 9, 10, 0.05)",
  md: "0 4px 12px rgba(8, 9, 10, 0.08)",
  lg: "0 12px 32px rgba(8, 9, 10, 0.12)",
} as const;

// Motion — the Framer-Motion contract from day one (§4.1).
export const motion = {
  durationFast: 150,
  durationBase: 220,
  durationSlow: 600,
  easingStandard: "cubic-bezier(0.2, 0.7, 0.2, 1)",
  // The approved showroom's timings (slice 8, ADR 0026). Durations in ms.
  /** Overlays landing: the spec drawer, the filter sheet, the lead modal (owner: longer, gentler). */
  durationOverlay: 700,
  /** Overlays leaving, with their scrim in sync. */
  durationOverlayOut: 480,
  /** A section or card fading in as it scrolls into view. */
  durationReveal: 650,
  /** The intro curtain lifting (owner: a smooth ~0.8 s). */
  durationCurtain: 800,
  /** The least time the curtain stays on screen, from navigation start (owner: ~1.2 s). */
  durationCurtainHold: 1200,
  /** The latest it waits for the hero image to decode, from navigation start. */
  durationCurtainHoldMax: 1800,
  /** A card's car driving into place. */
  durationEntrance: 1600,
  /** A card's figures counting up from zero. */
  durationCount: 1750,
  /** Between one revealed item and the next. */
  staggerReveal: 120,
  /** Before a card's car starts driving in. */
  delayEntrance: 75,
  /**
   * The intro curtain's CSS failsafe: it hides itself this long after the page loads even if no
   * JavaScript runs. Above the longest JavaScript path: the hold max (1800 ms) plus the lift
   * (800 ms), plus a margin.
   */
  delayCurtainFailsafe: 3200,
  easingReveal: "cubic-bezier(0.2, 0.6, 0.2, 1)",
  easingCurtain: "cubic-bezier(0.65, 0, 0.35, 1)",
  easingEntrance: "cubic-bezier(0.16, 1, 0.3, 1)",
  /**
   * A long, gentle ease-out: overlays in and out (owner, slice 8 review). The same curve as
   * easingEntrance on purpose; two names because they can be tuned apart.
   */
  easingGentle: "cubic-bezier(0.16, 1, 0.3, 1)",
  easingDecelerate: "cubic-bezier(0.33, 1, 0.68, 1)",
  /** How far a card's car travels in. */
  distanceEntrance: "2.5rem",
  /** How far an overlay panel rises in (the lead modal). */
  distanceOverlay: "1.5rem",
} as const;

/* Glass — a tinted, blurred panel over moving content (the model dock). The page behind it can be
   anything, so the tint alone must carry the text: every foreground is checked against the tint
   composited over the lightest possible backdrop (white) and the darkest (Onyx).
   Slice 8, ADR 0026. */
export const glass = {
  /** The model dock (owner: visibly translucent). Mist at 55% under a strong blur; Onyx text. */
  light: { tint: palette.mist, alpha: 0.55, fg: [palette.onyx] },
  /** The hero's trim pill, over the backdrop and the car (slice 8 review). Gunmetal at 88%. */
  dark: { tint: palette.gunmetal, alpha: 0.88, fg: [palette.onDark, palette.onDarkSoft] },
} as const;

// Responsive breakpoints (px) — Grid / Container consume these (revision R3).
export const breakpoints = { sm: 640, md: 768, lg: 1024, xl: 1280, "2xl": 1536 } as const;
