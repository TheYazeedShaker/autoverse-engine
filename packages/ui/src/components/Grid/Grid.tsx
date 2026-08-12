import type { ElementType, ReactNode } from "react";
import { cn } from "../../cn";

// Grid is the generic responsive layout grid: a fixed 12-column track whose children span columns via
// <Col>. Layout-only (no surface/colour/type of its own), so it composes under any Surface and stays AA
// by inheritance. The track is always 12 columns — responsiveness comes from each Col's per-breakpoint
// span, mobile-first. (This is the system grid, NOT the hero composition.)
export type GridGap = "sm" | "md" | "lg";

// Gap maps to the spacing scale (16 / 24 / 32px). Literal classes so Tailwind's scanner emits them.
const GAP: Record<GridGap, string> = {
  sm: "gap-4", // 16px
  md: "gap-6", // 24px
  lg: "gap-8", // 32px
};

export interface GridProps {
  children: ReactNode;
  /** Element to render — defaults to `div`. */
  as?: ElementType;
  gap?: GridGap;
  className?: string;
}

export function Grid({ children, as: Tag = "div", gap = "md", className }: GridProps) {
  return <Tag className={cn("grid grid-cols-12", GAP[gap], className)}>{children}</Tag>;
}
