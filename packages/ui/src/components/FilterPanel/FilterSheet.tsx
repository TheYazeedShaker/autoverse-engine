"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { breakpoints } from "@autoverse/tokens";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { overlayScrim, overlaySurface } from "../../overlay-motion";
import { useReducedMotionPreference } from "../../use-reduced-motion";
import { cn } from "../../cn";
import { Button } from "../Button";
import { FilterPanel, type FilterPanelProps } from "./FilterPanel";

// FilterSheet — the mobile frame for the FilterPanel (spec §5.5): a pill trigger ("Filters · 2") that
// opens a bottom sheet. Built on Radix Dialog, so the focus trap, Escape, the scrim click, scroll lock
// and focus return to the trigger are Radix's, not hand-rolled. The sheet's own button ("Show 4
// models") closes it; filters apply live, so there is nothing to confirm.
//
// Slice 8: it slides up from the bottom over a fading scrim (the overlay motion pair; instant under
// reduced motion), and it closes itself when the window grows to the sidebar's breakpoint (lg), where
// the sheet's trigger is no longer shown.

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
  const reduced = useReducedMotionPreference();
  // Controlled or not, the sheet knows whether it is open: the exit motion needs it.
  const [innerOpen, setInnerOpen] = useState(false);
  const isOpen = open ?? innerOpen;
  // The latest callback, read at call time: the lg listener below outlives the render that set it.
  const onOpenChangeRef = useRef(onOpenChange);
  onOpenChangeRef.current = onOpenChange;
  const setOpen = (next: boolean) => {
    setInnerOpen(next);
    onOpenChangeRef.current?.(next);
  };
  // Past lg the sidebar shows instead and the trigger is hidden: an open sheet would be orphaned.
  useEffect(() => {
    if (!isOpen || typeof window === "undefined" || !window.matchMedia) return;
    const wide = window.matchMedia(`(min-width: ${breakpoints.lg}px)`);
    const onChange = () => {
      if (wide.matches) setOpen(false);
    };
    // Only a change while open: the trigger is hidden at lg, so the sheet can't open there.
    wide.addEventListener?.("change", onChange);
    return () => wide.removeEventListener?.("change", onChange);
    // Keyed on isOpen only: setOpen is recreated per render, and the listener needs just this state.
  }, [isOpen]);
  return (
    <Dialog.Root open={isOpen} onOpenChange={setOpen}>
      <Dialog.Trigger
        className={cn(
          "border-fg/30 bg-surface-white/60 text-fg hover:border-fg/60 focus-visible:ring-focus-ring rounded-full border px-4 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2",
          triggerClassName,
        )}
      >
        {triggerLabel}
      </Dialog.Trigger>
      <AnimatePresence>
        {isOpen ? (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <motion.div
                className="bg-surface-dark/45 fixed inset-0 z-30"
                {...overlayScrim(reduced, "sheet")}
              />
            </Dialog.Overlay>
            <Dialog.Content
              asChild
              forceMount
              aria-describedby={undefined}
              // Focus the sheet itself, not its first field: focusing the search box would open the phone
              // keyboard over the filters. Tab still moves into the sheet, and the trap is Radix's.
              onOpenAutoFocus={(e) => {
                e.preventDefault();
                (e.currentTarget as HTMLElement | null)?.focus();
              }}
            >
              <motion.div
                {...overlaySurface("sheet", "ltr", reduced)}
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
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        ) : null}
      </AnimatePresence>
    </Dialog.Root>
  );
}
