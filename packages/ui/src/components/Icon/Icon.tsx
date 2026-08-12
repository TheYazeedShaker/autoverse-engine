import type { LucideIcon } from "lucide-react";

// Icon wraps a Lucide glyph so size + colour come from the system, not call sites (ADR-0006).
// Colour is `currentColor` → it inherits the themed foreground, so icons stay AA on any surface.
// Sizes track the spacing scale (16 / 20 / 24).
export type IconSize = "sm" | "md" | "lg";

const SIZE_PX: Record<IconSize, number> = { sm: 16, md: 20, lg: 24 };

export interface IconProps {
  /** A Lucide icon component, e.g. `import { Car } from "lucide-react"`. */
  icon: LucideIcon;
  size?: IconSize;
  /** Accessible name. Omit for purely decorative icons — they render `aria-hidden`. */
  label?: string;
  className?: string;
}

export function Icon({ icon: Glyph, size = "md", label, className }: IconProps) {
  const px = SIZE_PX[size];
  return (
    <Glyph
      width={px}
      height={px}
      strokeWidth={1.75}
      color="currentColor"
      className={className}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable={false}
    />
  );
}
