import { type ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "../../cn";

// Swatch is the option-control atom: a labelled, keyboard-operable toggle for a single configurator option
// (a paint colour / finish). It is a native `<button aria-pressed>` — the textbook accessible toggle — not
// a Radix primitive: there's no focus-trap / roving-tabindex / dismissal here, so the native pattern is both
// correct and simpler (the roving-focus group is SegmentedToggle's job). `value`/`optionName` foreshadow the
// configurator manifest vocabulary; the accessible name is the option label.
//
// Selection is shown by a ring AND `aria-pressed` (never colour alone). The ring/border use the contextual
// `--av-fg`, so they stay visible + AA on any surface; the chip fill is brand DATA, applied inline.
export type SwatchSize = "sm" | "md" | "lg";

const SIZE: Record<SwatchSize, string> = {
  sm: "h-6 w-6",
  md: "h-8 w-8",
  lg: "h-10 w-10",
};

export interface SwatchProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "value" | "color" | "onSelect"
> {
  /** The option's machine value, passed to `onSelect` (foreshadows the configurator manifest vocabulary). */
  value: string;
  /** Human-readable option label — becomes the accessible name (e.g. "Midnight Black"). */
  optionName: string;
  /** The colour/finish rendered in the chip. Brand DATA, not a design token — hence an inline background;
   *  this is the one legitimate place a component paints a raw colour. */
  color: string;
  selected?: boolean;
  onSelect?: (value: string) => void;
  size?: SwatchSize;
}

export const Swatch = forwardRef<HTMLButtonElement, SwatchProps>(function Swatch(
  {
    value,
    optionName,
    color,
    selected = false,
    onSelect,
    size = "md",
    className,
    disabled,
    ...props
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      aria-pressed={selected}
      aria-label={optionName}
      title={optionName}
      disabled={disabled}
      onClick={() => onSelect?.(value)}
      className={cn(
        "inline-block rounded-full border border-fg/20 outline-none transition-shadow",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg",
        selected && "ring-2 ring-fg ring-offset-2 ring-offset-transparent",
        "disabled:pointer-events-none disabled:opacity-40",
        SIZE[size],
        className,
      )}
      style={{ backgroundColor: color }}
      {...props}
    />
  );
});
