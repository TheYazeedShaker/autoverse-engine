import type { CSSProperties, ElementType, ReactNode } from "react";
import { cn } from "../../cn";

// Card is a surface container, and a surface is its OWN variant that carries its foreground (§4.2) — never a
// `.dark` modifier over a light-assuming base. Each tone sets its background + foreground AND republishes the
// contextual pair (`--av-fg` / `--av-fg-muted` / `--av-bg`), so anything dropped inside — Text, StatBlock, a
// primary Button — inverts to match the Card automatically and stays AA. The (bg,fg)/(bg,fgMuted) pairs are
// AA by the token invariant tests, so a Card can't become dark-on-dark.
export type CardTone = "card" | "panel" | "dark";
export type CardPadding = "none" | "sm" | "md" | "lg";

const TONE: Record<CardTone, { bg: string; fg: string; fgMuted: string }> = {
  card: {
    bg: "var(--av-surface-card)",
    fg: "var(--av-on-card)",
    fgMuted: "var(--av-on-card-muted)",
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

const PADDING: Record<CardPadding, string> = {
  none: "",
  sm: "p-4",
  md: "p-6",
  lg: "p-8",
};

export interface CardProps {
  children: ReactNode;
  tone?: CardTone;
  padding?: CardPadding;
  /** Hairline border, built from the contextual fg so it adapts to the tone (dark line on light, light on dark). */
  border?: boolean;
  /** Element to render — defaults to `div`. */
  as?: ElementType;
  className?: string;
}

export function Card({
  children,
  tone = "card",
  padding = "md",
  border = true,
  as: Tag = "div",
  className,
}: CardProps) {
  const t = TONE[tone];
  // Publish the contextual pair (and set the actual bg/fg) from token vars — no raw values.
  const style = {
    background: t.bg,
    color: t.fg,
    "--av-fg": t.fg,
    "--av-fg-muted": t.fgMuted,
    "--av-bg": t.bg,
  } as CSSProperties;

  return (
    <Tag
      style={style}
      className={cn("rounded-xl", border && "border border-fg/10", PADDING[padding], className)}
    >
      {children}
    </Tag>
  );
}
