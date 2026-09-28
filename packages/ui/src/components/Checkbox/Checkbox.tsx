"use client";

import * as RadixCheckbox from "@radix-ui/react-checkbox";
import { Check } from "lucide-react";
import { useId, type ReactNode } from "react";
import { cn } from "../../cn";
import { Icon } from "../Icon";

// Checkbox — a labelled yes/no (slice 7: the lead form's required consent). Radix Checkbox: the
// role, aria-checked, Space to toggle and focus are Radix's (ADR-0004). The label is a real <label>
// for the control, so clicking the text toggles it too; long text (a consent wording) wraps beside
// the box. An error is tied by aria-describedby and sets aria-invalid.

export interface CheckboxProps {
  label: ReactNode;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  error?: string | null;
  required?: boolean;
  disabled?: boolean;
  name?: string;
  className?: string;
}

export function Checkbox({
  label,
  checked,
  onCheckedChange,
  error,
  required,
  disabled,
  name,
  className,
}: CheckboxProps) {
  const id = useId();
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex items-start gap-3">
        <RadixCheckbox.Root
          id={id}
          checked={checked}
          onCheckedChange={(c) => onCheckedChange(c === true)}
          required={required}
          disabled={disabled}
          name={name}
          aria-describedby={errorId}
          aria-invalid={error ? true : undefined}
          className={cn(
            "bg-surface-white text-on-white focus-visible:ring-focus-ring data-[state=checked]:bg-fg data-[state=checked]:text-bg mt-0.5 grid size-5 shrink-0 place-items-center rounded-sm border focus-visible:outline-none focus-visible:ring-2 disabled:opacity-50",
            error ? "border-error" : "border-fg-muted",
          )}
        >
          <RadixCheckbox.Indicator>
            <Icon icon={Check} size="sm" />
          </RadixCheckbox.Indicator>
        </RadixCheckbox.Root>
        <label htmlFor={id} className="text-fg text-sm leading-relaxed">
          {label}
        </label>
      </div>
      {error ? (
        <p id={errorId} className="text-error ps-8 text-xs font-medium">
          {error}
        </p>
      ) : null}
    </div>
  );
}
