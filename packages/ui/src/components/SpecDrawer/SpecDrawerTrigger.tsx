"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Icon } from "../Icon";

// The card's "Technical data ›" row that opens the SpecDrawer (spec §5.7): an underlined row with a
// chevron pointing along the reading direction. The app passes onClick (it owns the drawer).

export interface SpecDrawerTriggerProps {
  label: string;
  dir: "ltr" | "rtl";
  /** Called with the button itself, so the drawer can return focus to it on close. */
  onClick?: (trigger: HTMLButtonElement) => void;
  disabled?: boolean;
}

export function SpecDrawerTrigger({ label, dir, onClick, disabled }: SpecDrawerTriggerProps) {
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      disabled={disabled}
      onClick={(e) => onClick?.(e.currentTarget)}
      className="text-fg hover:text-accent focus-visible:ring-focus-ring flex min-h-12 w-full items-center justify-between gap-2 px-4 text-start text-sm underline decoration-1 underline-offset-4 transition-colors duration-(--av-dur-modal) ease-(--av-ease-modal) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset disabled:opacity-50 motion-reduce:transition-none"
    >
      <span>{label}</span>
      <Icon icon={dir === "rtl" ? ChevronLeft : ChevronRight} size="sm" className="shrink-0" />
    </button>
  );
}
