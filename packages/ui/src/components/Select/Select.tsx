"use client";

import * as RadixSelect from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import { useId } from "react";
import { cn } from "../../cn";
import { Icon } from "../Icon";

// Select — a labelled single choice from a list (slice 7: the lead form's city and model). Radix
// Select: the listbox semantics, typeahead, keyboard and focus handling are Radix's, never
// hand-rolled (ADR-0004). Skinned with tokens to match TextField.
//
// - The visible <label> names the trigger (aria-labelledby); the hint and the error describe it,
//   and an error sets aria-invalid.
// - The list is portaled (above a dialog: z-50) and follows the reading direction.

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps {
  label: string;
  options: SelectOption[];
  value: string | undefined;
  onValueChange: (value: string) => void;
  /** Shown while nothing is chosen. */
  placeholder: string;
  hint?: string;
  error?: string | null;
  required?: boolean;
  disabled?: boolean;
  /** The form field name (Radix renders a hidden native select inside a form). */
  name?: string;
  dir: "ltr" | "rtl";
  className?: string;
}

export function Select({
  label,
  options,
  value,
  onValueChange,
  placeholder,
  hint,
  error,
  required,
  disabled,
  name,
  dir,
  className,
}: SelectProps) {
  const id = useId();
  const labelId = `${id}-label`;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <span id={labelId} className="text-fg text-sm font-medium">
        {label}
        {required ? (
          <span aria-hidden="true" className="text-fg-muted">
            {" *"}
          </span>
        ) : null}
      </span>
      <RadixSelect.Root
        value={value}
        onValueChange={onValueChange}
        required={required}
        disabled={disabled}
        name={name}
        dir={dir}
      >
        <RadixSelect.Trigger
          id={id}
          aria-labelledby={labelId}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          aria-required={required || undefined}
          className={cn(
            "bg-surface-white text-on-white focus-visible:ring-focus-ring data-[placeholder]:text-on-white-muted flex h-12 w-full items-center justify-between gap-2 rounded-md border px-3.5 text-start text-base focus-visible:outline-none focus-visible:ring-2 disabled:opacity-50",
            error ? "border-error" : "border-fg-muted",
          )}
        >
          <RadixSelect.Value placeholder={placeholder} />
          <RadixSelect.Icon className="text-on-white-muted shrink-0">
            <Icon icon={ChevronDown} size="sm" />
          </RadixSelect.Icon>
        </RadixSelect.Trigger>
        <RadixSelect.Portal>
          <RadixSelect.Content
            position="popper"
            sideOffset={4}
            dir={dir}
            className="bg-surface-white text-on-white border-fg/15 z-50 max-h-(--radix-select-content-available-height) min-w-(--radix-select-trigger-width) overflow-hidden rounded-md border shadow-lg"
          >
            <RadixSelect.Viewport className="p-1">
              {options.map((o) => (
                <RadixSelect.Item
                  key={o.value}
                  value={o.value}
                  className="data-[highlighted]:bg-fg data-[highlighted]:text-bg relative flex cursor-pointer items-center rounded-sm py-2.5 ps-8 pe-3 text-base outline-none select-none"
                >
                  <RadixSelect.ItemIndicator className="absolute start-2 inline-flex items-center">
                    <Icon icon={Check} size="sm" />
                  </RadixSelect.ItemIndicator>
                  <RadixSelect.ItemText>{o.label}</RadixSelect.ItemText>
                </RadixSelect.Item>
              ))}
            </RadixSelect.Viewport>
          </RadixSelect.Content>
        </RadixSelect.Portal>
      </RadixSelect.Root>
      {hint ? (
        <p id={hintId} className="text-fg-muted text-xs">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-error text-xs font-medium">
          {error}
        </p>
      ) : null}
    </div>
  );
}
