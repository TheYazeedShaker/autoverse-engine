import type { ReactNode } from "react";

// Heading renders a semantic h1–h4 with a default size per level (overridable). Like Text, it inherits
// font-family + colour, so it stays lang-aware (Cairo under lang="ar") and AA on any surface.
export type HeadingLevel = 1 | 2 | 3 | 4;
export type HeadingSize = "xl" | "2xl" | "3xl" | "4xl";

const DEFAULT_SIZE: Record<HeadingLevel, HeadingSize> = { 1: "4xl", 2: "3xl", 3: "2xl", 4: "xl" };

export interface HeadingProps {
  children: ReactNode;
  level?: HeadingLevel;
  /** Override the visual size independently of the semantic level. */
  size?: HeadingSize;
  className?: string;
}

export function Heading({ children, level = 2, size, className }: HeadingProps) {
  const Tag = `h${level}` as const;
  const sz = size ?? DEFAULT_SIZE[level];
  return (
    <Tag
      className={className}
      style={{
        margin: 0,
        fontWeight: 700,
        letterSpacing: "-0.01em",
        fontSize: `var(--av-text-${sz})`,
      }}
    >
      {children}
    </Tag>
  );
}
