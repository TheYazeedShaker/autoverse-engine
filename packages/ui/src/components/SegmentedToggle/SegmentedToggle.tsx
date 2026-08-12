import * as RadioGroup from "@radix-ui/react-radio-group";
import { forwardRef } from "react";
import { cn } from "../../cn";

// SegmentedToggle is the single-select-of-N control (e.g. drive mode, trim). It's built on Radix
// RadioGroup, so it gets correct **radio semantics** (role=radiogroup / role=radio + aria-checked) and
// **roving focus** (arrow keys move + select, one tab stop) for free — never hand-rolled (ADR-0004). The
// selected segment reuses the contextual inverted fill (`bg-fg text-bg`, like primary Button), so it stays
// AA on any surface; the track + idle text use `--av-fg`, so the whole control inverts with its surface.
export interface SegmentedOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export type SegmentedToggleSize = "sm" | "md";

const ITEM_SIZE: Record<SegmentedToggleSize, string> = {
  sm: "px-2.5 py-1 text-sm",
  md: "px-3.5 py-1.5 text-base",
};

export interface SegmentedToggleProps {
  options: SegmentedOption[];
  /** Accessible name for the group — required, labels the radiogroup. */
  label: string;
  /** Controlled selected value. */
  value?: string;
  /** Uncontrolled initial value. */
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  size?: SegmentedToggleSize;
  /** Reading direction for keyboard nav; defaults to ltr (pass "rtl" under RTL, or use a DirectionProvider). */
  dir?: "ltr" | "rtl";
  className?: string;
}

export const SegmentedToggle = forwardRef<HTMLDivElement, SegmentedToggleProps>(
  function SegmentedToggle(
    { options, label, value, defaultValue, onValueChange, size = "md", dir, className },
    ref,
  ) {
    return (
      <RadioGroup.Root
        ref={ref}
        aria-label={label}
        value={value}
        defaultValue={defaultValue}
        onValueChange={onValueChange}
        dir={dir}
        loop
        className={cn(
          "inline-flex items-center gap-1 rounded-lg border border-fg/15 p-1",
          className,
        )}
      >
        {options.map((opt) => (
          <RadioGroup.Item
            key={opt.value}
            value={opt.value}
            disabled={opt.disabled}
            className={cn(
              "cursor-pointer rounded-md font-medium text-fg outline-none transition-colors",
              "hover:bg-fg/10",
              "data-[state=checked]:bg-fg data-[state=checked]:text-bg data-[state=checked]:hover:bg-fg",
              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg",
              "disabled:pointer-events-none disabled:opacity-40",
              ITEM_SIZE[size],
            )}
          >
            {opt.label}
          </RadioGroup.Item>
        ))}
      </RadioGroup.Root>
    );
  },
);
