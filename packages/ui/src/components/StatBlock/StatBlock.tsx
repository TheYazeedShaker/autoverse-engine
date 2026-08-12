import type { ElementType } from "react";
import { cn } from "../../cn";

// StatBlock is the spec-ribbon atom: one figure rendered as a prominent `value` (+ optional `unit`) over a
// muted `label` — e.g. "3.2 s" / "0–100 km/h". Display-only (no interaction). It sets no colour of its own:
// the value uses the contextual `--av-fg` and the label `--av-fg-muted`, both AA on any surface, so the same
// block reads correctly on the dark spec ribbon and on a light surface alike.
export type StatBlockSize = "md" | "lg";

const VALUE_SIZE: Record<StatBlockSize, string> = {
  md: "text-2xl",
  lg: "text-4xl",
};

const UNIT_SIZE: Record<StatBlockSize, string> = {
  md: "text-base",
  lg: "text-lg",
};

export interface StatBlockProps {
  value: string | number;
  /** Optional unit shown next to the value (e.g. "s", "km", "hp"). */
  unit?: string;
  label: string;
  size?: StatBlockSize;
  /** Horizontal alignment of the stacked value + label. */
  align?: "start" | "center";
  /** Element to render — defaults to `div`. */
  as?: ElementType;
  className?: string;
}

export function StatBlock({
  value,
  unit,
  label,
  size = "md",
  align = "start",
  as: Tag = "div",
  className,
}: StatBlockProps) {
  return (
    <Tag
      className={cn(
        "flex flex-col gap-1",
        align === "center" && "items-center text-center",
        className,
      )}
    >
      <span className={cn("text-fg flex items-baseline gap-1 font-semibold", VALUE_SIZE[size])}>
        {value}
        {unit ? (
          <span className={cn("text-fg-muted font-medium", UNIT_SIZE[size])}>{unit}</span>
        ) : null}
      </span>
      <span className="text-fg-muted text-sm">{label}</span>
    </Tag>
  );
}
