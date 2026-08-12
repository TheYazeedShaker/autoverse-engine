import type { ElementType, ReactNode } from "react";
import { cn } from "../../cn";

// Col is a child of <Grid>: it spans N of the 12 columns and can change that span at each breakpoint
// (mobile-first — `span` is the base, sm/md/lg/xl override upward). A column span is a structural integer
// (1–12), not a design token, so this is the one place a numeric prop drives the class name; the resulting
// col-span utilities are safelisted in styles/tailwind.css (@source inline) since the scanner can't see
// them composed at runtime. Layout-only, like Grid.
export type ColSpan = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

export interface ColProps {
  children: ReactNode;
  /** Element to render — defaults to `div`. */
  as?: ElementType;
  /** Columns to span at the base (mobile-first) width. Defaults to the full row (12). */
  span?: ColSpan;
  /** Span overrides from each breakpoint up. NB: if a `2xl` (or any new) breakpoint is added here, extend
   *  the `@source inline` col-span safelist in styles/tailwind.css too, or the class silently won't exist. */
  sm?: ColSpan;
  md?: ColSpan;
  lg?: ColSpan;
  xl?: ColSpan;
  className?: string;
}

export function Col({ children, as: Tag = "div", span = 12, sm, md, lg, xl, className }: ColProps) {
  return (
    <Tag
      className={cn(
        `col-span-${span}`,
        sm && `sm:col-span-${sm}`,
        md && `md:col-span-${md}`,
        lg && `lg:col-span-${lg}`,
        xl && `xl:col-span-${xl}`,
        className,
      )}
    >
      {children}
    </Tag>
  );
}
