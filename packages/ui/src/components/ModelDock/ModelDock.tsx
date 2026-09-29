"use client";

import { LayoutGroup, motion, useReducedMotion } from "motion/react";
import { useId } from "react";
import { cn } from "../../cn";
import { semanticMotion, safeTransition } from "../../motion";

// ModelDock — the floating model switcher (spec §5.4): pills on visibly translucent light glass
// (slice 8, owner review). The tint is the `glass-light` token, Mist at 55% under a strong blur; the
// names are Onyx, checked against the tint composited over white, Mist and Onyx (tokens
// glass.test.ts: 5.9:1 at worst, over Onyx), so they stay AA whatever scrolls beneath. The active pill
// is solid Gunmetal with light ink (14:1). A sliding active pill. It is
// a navigation landmark of in-page links; the active one carries aria-current. The pill slides with
// motion's shared layout (transform only, the `pillSlide` semantic motion) and jumps under reduced
// motion.
//
// The app decides everything else: which models (only the visible ones), which is active (two-way
// sync with the carousel and scroll-spy), and whether the dock is shown (only once the hero is
// scrolled past, and never with fewer than 2 visible models). Hidden, it is `inert`, so it is out of
// the tab order and the accessibility tree.

export interface DockModel {
  id: string;
  name: string;
  /** The section anchor, e.g. "#aurora-gt". */
  href: string;
}

export interface ModelDockProps {
  models: DockModel[];
  activeId: string | null;
  onPick: (id: string) => void;
  /** Landmark name, e.g. "Models". */
  label: string;
  /** Shown once the hero is scrolled past. */
  shown: boolean;
  className?: string;
}

export function ModelDock({ models, activeId, onPick, label, shown, className }: ModelDockProps) {
  const reduced = useReducedMotion();
  const group = useId();
  return (
    <div
      inert={!shown}
      data-shown={shown}
      className={cn(
        "pointer-events-none sticky top-3.5 z-20 flex h-0 justify-center transition-[opacity,transform] duration-(--av-dur-slow) ease-(--av-ease) motion-reduce:transition-none",
        shown ? "translate-y-0 opacity-100" : "-translate-y-3.5 opacity-0",
        className,
      )}
    >
      <nav
        aria-label={label}
        className="border-surface-white/60 bg-glass-light pointer-events-auto backdrop-blur-2xl backdrop-saturate-150 relative flex h-fit max-w-[min(94vw,68.75rem)] gap-1 overflow-x-auto rounded-full border p-1.5 shadow-lg [scrollbar-width:none] lg:p-2"
      >
        <LayoutGroup id={group}>
          <ul role="list" className="flex gap-1">
            {models.map((m) => {
              const on = m.id === activeId;
              return (
                <li key={m.id} className="relative flex-none">
                  {on ? (
                    <motion.span
                      layoutId="dock-pill"
                      aria-hidden="true"
                      transition={safeTransition(semanticMotion.pillSlide, reduced)}
                      className="bg-surface-dark absolute inset-0 rounded-full"
                    />
                  ) : null}
                  <a
                    href={m.href}
                    aria-current={on ? "true" : undefined}
                    onClick={(e) => {
                      e.preventDefault();
                      onPick(m.id);
                    }}
                    className={cn(
                      "focus-visible:ring-focus-ring relative block rounded-full px-3.5 py-2 text-sm font-medium whitespace-nowrap transition-colors duration-(--av-dur-fast) ease-(--av-ease) focus-visible:outline-none focus-visible:ring-2 motion-reduce:transition-none lg:px-4 lg:py-2.5 lg:text-base",
                      on ? "text-on-dark" : "text-on-surface",
                    )}
                  >
                    {m.name}
                  </a>
                </li>
              );
            })}
          </ul>
        </LayoutGroup>
      </nav>
    </div>
  );
}
