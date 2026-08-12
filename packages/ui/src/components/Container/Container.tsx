import type { ElementType, ReactNode } from "react";
import { cn } from "../../cn";

// Container centres page content and applies the shared horizontal gutter, so every section uses one
// max-width + padding rhythm instead of re-deriving it. It owns LAYOUT ONLY — no surface, colour, or
// type — so it composes under any Surface and stays AA by inheritance. The gutter is symmetric, so the
// component is correct in both LTR and RTL without logical-property gymnastics.
export type ContainerWidth = "narrow" | "default" | "full";

// Widths map to the token max-width scale (no raw px): narrow for prose/forms, default for standard
// page content, full when only the gutter should constrain the edges.
const WIDTH: Record<ContainerWidth, string> = {
  narrow: "max-w-3xl", // ~768px — a single reading/lead column
  default: "max-w-7xl", // ~1280px — standard page content width
  full: "max-w-full", // edge-constrained only by the gutter
};

// Responsive horizontal gutter from the 4px spacing scale (16 → 24 → 32px). NB: the spacing scale and
// breakpoints are NOT yet bridged into the @theme (tailwind.css only bridges colour/radius/type/shadow),
// so `px-*`, `max-w-*` and the sm/lg prefixes resolve to Tailwind's defaults — which equal our
// --av-space-* / --av-bp-* tokens 1:1 today. The Grid slice formalises the spacing + breakpoint → @theme
// bridge so this stops relying on that coincidence.
const GUTTER = "px-4 sm:px-6 lg:px-8";

export interface ContainerProps {
  children: ReactNode;
  /** Element to render — defaults to `div`. Use `main`/`section` for semantic page regions. */
  as?: ElementType;
  width?: ContainerWidth;
  className?: string;
}

export function Container({
  children,
  as: Tag = "div",
  width = "default",
  className,
}: ContainerProps) {
  return <Tag className={cn("mx-auto w-full", WIDTH[width], GUTTER, className)}>{children}</Tag>;
}
