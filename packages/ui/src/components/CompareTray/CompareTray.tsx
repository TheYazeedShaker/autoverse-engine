"use client";

import { useRef, type ReactNode } from "react";
import { cn } from "../../cn";
import { Button } from "../Button";

// CompareTray — the floating tray of trims picked for comparison (spec §5.9), rebuilt from the
// approved page: a dark tray pinned to the bottom centre, a thumbnail + name + Remove per trim, and
// "Compare N". It appears with the first pick and goes with the last.
//
// - "Compare N" needs at least `minToCompare` picks, and an `href`: the compare page sits behind its
//   own flag until PAGE-CONSUMER-COMPARE ships, and without it the button is honestly disabled.
// - A polite live region announces the count, so picking on a card is confirmed without moving
//   focus.
// - Removing an item moves focus to the next Remove (or the Compare button); removing the last one
//   returns focus to its own toggle on the card. Never to <body>.
// - The dark tray re-publishes the contextual pair, so the inverting primary button is Mist on dark
//   (as approved) and AA.

export interface CompareTrayItem {
  id: string;
  name: string;
  /** A small image element for the thumbnail, or null. */
  thumbnail: ReactNode | null;
}

export interface CompareTrayProps {
  items: CompareTrayItem[];
  onRemove: (id: string) => void;
  /** The compare page's link for these items, or null while it isn't available. */
  href: string | null;
  minToCompare?: number;
  labels: {
    /** Landmark name, e.g. "Comparison". */
    region: string;
    remove: (name: string) => string;
    removeShort: string;
    /** e.g. "Compare 2". */
    compare: (n: number) => string;
    /** Live-region text, e.g. "2 trims selected for comparison" (also called with 0). */
    status: (n: number) => string;
  };
  className?: string;
}

export function CompareTray({
  items,
  onRemove,
  href,
  minToCompare = 2,
  labels,
  className,
}: CompareTrayProps) {
  const ready = items.length >= minToCompare && href !== null;
  const trayRef = useRef<HTMLElement>(null);
  // Once anything has been picked, every change is announced, including back to zero.
  const hasPicked = useRef(false);
  if (items.length > 0) hasPicked.current = true;

  const remove = (id: string, index: number) => {
    const last = items.length === 1;
    onRemove(id);
    requestAnimationFrame(() => {
      if (last) {
        // The tray is gone: return focus to that item's own toggle (its card's checkbox), never
        // to <body>.
        [...document.querySelectorAll<HTMLElement>("[data-compare-toggle]")]
          .find((el) => el.dataset.compareToggle === id)
          ?.focus();
        return;
      }
      // Keep focus in the tray: the next item's Remove, else the previous one, else Compare.
      const tray = trayRef.current;
      const buttons = tray?.querySelectorAll<HTMLElement>("[data-compare-remove]") ?? [];
      const next = buttons[Math.min(index, buttons.length - 1)];
      (next ?? tray?.querySelector<HTMLElement>("[data-compare-go]"))?.focus();
    });
  };

  return (
    <>
      <p aria-live="polite" className="sr-only">
        {hasPicked.current ? labels.status(items.length) : ""}
      </p>
      {items.length === 0 ? null : (
        <section
          aria-label={labels.region}
          ref={trayRef}
          data-compare-tray
          className={cn(
            "bg-surface-dark/90 text-on-dark border-on-dark/10 fixed bottom-[max(1.5rem,env(safe-area-inset-bottom))] left-1/2 z-30 flex max-w-[94vw] -translate-x-1/2 flex-wrap items-center justify-center gap-x-4 gap-y-3 overflow-x-auto rounded-xl border px-3 py-2.5 shadow-lg backdrop-blur-xl [--av-bg:var(--av-surface-dark)] [--av-fg-muted:var(--av-on-dark-muted)] [--av-fg:var(--av-on-dark)]",
            className,
          )}
        >
          <ul role="list" className="flex flex-wrap items-center justify-center gap-x-4 gap-y-3">
            {items.map((item, i) => (
              <li key={item.id} className="flex items-center gap-2.5">
                <span className="bg-on-dark/10 relative h-10 w-18 shrink-0 overflow-hidden rounded-md">
                  {item.thumbnail ? (
                    <span className="absolute inset-0.5 rtl:-scale-x-100">{item.thumbnail}</span>
                  ) : null}
                </span>
                <span className="flex flex-col items-start">
                  <span className="text-on-dark text-xs font-medium whitespace-nowrap">
                    {item.name}
                  </span>
                  <button
                    type="button"
                    data-compare-remove
                    aria-label={labels.remove(item.name)}
                    onClick={() => remove(item.id, i)}
                    className="text-on-dark-muted hover:text-on-dark focus-visible:ring-focus-ring rounded-sm text-xs focus-visible:outline-none focus-visible:ring-2"
                  >
                    {labels.removeShort}
                  </button>
                </span>
              </li>
            ))}
          </ul>
          {ready ? (
            <Button asChild variant="primary" size="md">
              <a href={href} data-compare-go>
                {labels.compare(items.length)}
              </a>
            </Button>
          ) : (
            <Button variant="primary" size="md" disabled data-compare-go>
              {labels.compare(items.length)}
            </Button>
          )}
        </section>
      )}
    </>
  );
}
