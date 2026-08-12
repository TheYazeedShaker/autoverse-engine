import type { ElementType, ReactNode } from "react";

// Body text on the type scale. Deliberately does NOT set font-family or color: it inherits, so the
// `[lang="ar"]` token rule swaps Google Sans Flex → Cairo automatically, and text always uses the
// surface's themed foreground (AA on any surface). Size comes from the `--av-text-*` tokens.
export type TextSize = "xs" | "sm" | "base" | "lg" | "xl";
export type TextWeight = 400 | 500 | 600 | 700;

export interface TextProps {
  children: ReactNode;
  /** Element to render — defaults to `p`. */
  as?: ElementType;
  size?: TextSize;
  weight?: TextWeight;
  className?: string;
}

export function Text({ children, as: Tag = "p", size = "base", weight, className }: TextProps) {
  return (
    <Tag
      className={className}
      style={{ margin: 0, fontSize: `var(--av-text-${size})`, fontWeight: weight }}
    >
      {children}
    </Tag>
  );
}
