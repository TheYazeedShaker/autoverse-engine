"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { cn } from "../../cn";
import { Button } from "../Button";
import { FilterPanel, type FilterPanelProps } from "./FilterPanel";

// FilterSheet — the mobile frame for the FilterPanel (spec §5.5): a pill trigger ("Filters · 2") that
// opens a bottom sheet. Built on Radix Dialog, so the focus trap, Escape, the scrim click, scroll lock
// and focus return to the trigger are Radix's, not hand-rolled. The sheet's own button ("Show 4
// models") closes it; filters apply live, so there is nothing to confirm.
//
// Enter/exit motion is deliberately deferred to slice 8 (motion polish); it opens and closes instantly.

export interface FilterSheetProps extends Omit<FilterPanelProps, "variant"> {
  /** Trigger label, e.g. "Filters · 2". */
  triggerLabel: string;
  /** The sheet's done button, e.g. "Show 4 models". */
  doneLabel: string;
  /**
   * The result count, e.g. "4 of 5 models", announced politely inside the sheet. The modal sheet
   * hides the rest of the page from assistive tech, so the page's own live region is silent while
   * it is open.
   */
  status: string;
  /** Controlled open state (optional). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  triggerClassName?: string;
}

export function FilterSheet({
  triggerLabel,
  doneLabel,
  status,
  open,
  onOpenChange,
  triggerClassName,
  className,
  ...panel
}: FilterSheetProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Trigger
        className={cn(
          "border-fg/30 bg-surface-white/60 text-fg hover:border-fg/60 focus-visible:ring-focus-ring rounded-full border px-4 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2",
          triggerClassName,
        )}
      >
        {triggerLabel}
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="bg-surface-dark/45 fixed inset-0 z-30" />
        <Dialog.Content
          aria-describedby={undefined}
          // Focus the sheet itself, not its first field: focusing the search box would open the phone
          // keyboard over the filters. Tab still moves into the sheet, and the trap is Radix's.
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            (e.currentTarget as HTMLElement | null)?.focus();
          }}
          className={cn(
            "bg-surface text-on-surface fixed inset-x-0 bottom-0 z-30 max-h-[78dvh] overflow-y-auto rounded-t-xl px-5 pt-4 pb-7 shadow-lg focus:outline-none",
            className,
          )}
        >
          <div aria-hidden="true" className="bg-fg/20 mx-auto mb-3.5 h-1 w-9 rounded-full" />
          <Dialog.Title className="sr-only">{panel.labels.title}</Dialog.Title>
          <FilterPanel {...panel} variant="sheet" />
          <p role="status" className="sr-only">
            {status}
          </p>
          <Dialog.Close asChild>
            <Button variant="accent" size="lg" className="mt-5 w-full">
              {doneLabel}
            </Button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
