"use client";

import { Check } from "lucide-react";
import { useId } from "react";
import { cn } from "../../cn";
import { Icon } from "../Icon";

// CompareToggle — the card's "Compare" checkbox (spec §5.7, §5.9). A real <input type="checkbox">
// with its <label>, visually replaced by a token-styled box: native semantics and keyboard, nothing
// hand-rolled. At the limit an unchecked toggle is aria-disabled (still focusable) and says why
// (`limitNote`), so a keyboard or screen-reader user learns the rule instead of meeting a dead control.

export interface CompareToggleProps {
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** True when the tray is full and this one isn't in it. */
  atLimit?: boolean;
  /** e.g. "Up to 3 trims can be compared", shown to assistive tech when at the limit. */
  limitNote?: string;
  className?: string;
  /** The item this toggles (e.g. the trim id): lets the tray return focus here when it empties. */
  value?: string;
}

export function CompareToggle({
  label,
  checked,
  onCheckedChange,
  atLimit = false,
  limitNote,
  value,
  className,
}: CompareToggleProps) {
  const id = useId();
  const disabled = atLimit && !checked;
  return (
    <span className={cn("inline-flex items-center", disabled && "opacity-45", className)}>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        aria-disabled={disabled || undefined}
        data-compare-toggle={value}
        // At the limit the box stays focusable (aria-disabled, not disabled), so a keyboard user
        // reaches it and hears why; a change is simply ignored.
        onChange={(e) => {
          if (!disabled) onCheckedChange(e.target.checked);
        }}
        aria-describedby={disabled && limitNote ? `${id}-limit` : undefined}
        className="peer sr-only"
      />
      <label
        htmlFor={id}
        className={cn(
          "text-fg-muted peer-focus-visible:ring-focus-ring flex min-h-7 cursor-pointer items-center gap-2 rounded-sm text-sm peer-focus-visible:ring-2",
          disabled && "cursor-not-allowed",
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "grid size-4.5 shrink-0 place-items-center rounded-sm border transition-colors duration-(--av-dur-modal) ease-(--av-ease-modal) motion-reduce:transition-none",
            checked ? "bg-accent border-accent text-on-accent" : "border-fg/35 bg-transparent",
          )}
        >
          {checked ? <Icon icon={Check} size="sm" className="size-3" /> : null}
        </span>
        <span>{label}</span>
      </label>
      {disabled && limitNote ? (
        <span id={`${id}-limit`} className="sr-only">
          {limitNote}
        </span>
      ) : null}
    </span>
  );
}
