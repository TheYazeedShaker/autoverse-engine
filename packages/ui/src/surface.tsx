import type { CSSProperties, ReactNode } from "react";

// Surface demonstrates the contrast rule structurally: a "dark" surface is its OWN variant that sets its
// own foreground, never a modifier layered over a light-assuming base. It also publishes the contextual
// fg/bg pair (--av-fg / --av-fg-muted / --av-bg), so inverting descendants (e.g. a primary Button) adapt
// to the surface they sit on.
type Tone = "base" | "panel" | "dark";

interface ToneTokens {
  bg: string;
  fg: string;
  fgMuted: string;
}

const TONES: Record<Tone, ToneTokens> = {
  base: {
    bg: "var(--av-surface)",
    fg: "var(--av-on-surface)",
    fgMuted: "var(--av-on-surface-muted)",
  },
  panel: {
    bg: "var(--av-surface-panel)",
    fg: "var(--av-on-panel)",
    fgMuted: "var(--av-on-panel-muted)",
  },
  dark: {
    bg: "var(--av-surface-dark)",
    fg: "var(--av-on-dark)",
    fgMuted: "var(--av-on-dark-muted)",
  },
};

export function Surface({ tone = "base", children }: { tone?: Tone; children: ReactNode }) {
  const t = TONES[tone];
  // Re-publish the contextual pair for this surface alongside the actual background/color.
  const style = {
    background: t.bg,
    color: t.fg,
    "--av-fg": t.fg,
    "--av-fg-muted": t.fgMuted,
    "--av-bg": t.bg,
    borderRadius: "var(--av-radius)",
    padding: "var(--av-space-24)",
    fontFamily: "var(--av-font-en)",
  } as CSSProperties;
  return <div style={style}>{children}</div>;
}
