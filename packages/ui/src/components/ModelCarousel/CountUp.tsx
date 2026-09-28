"use client";

import { animate, useReducedMotion } from "motion/react";
import { useLayoutEffect, useRef } from "react";
import { semanticMotion } from "../../motion";

// CountUp — a number that tweens from its previous value to the new one (spec §5.3: the hero's key
// stats "tween from the previous model's values"). The `countUp` semantic motion; under reduced motion
// it jumps. The tween writes the text directly (no re-render per frame) and is aria-hidden; screen
// readers get the final value from a visually hidden twin, so they never hear the intermediate digits.

export interface CountUpProps {
  /** The value to show; null shows an em dash. */
  value: number | null;
  /** Formats a number for display (digits, decimals). */
  format: (n: number) => string;
  className?: string;
}

export function CountUp({ value, format, className }: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const shown = useRef<number | null>(value);
  const formatRef = useRef(format);
  formatRef.current = format;
  const reduced = useReducedMotion();
  const tweening = useRef(false);
  const text = (n: number | null) => (n === null ? "—" : formatRef.current(n));

  // The tween writes the text node directly, so React no longer keeps it in step. When nothing is
  // tweening, re-write it on every render: a new format (EN ↔ AR digits) with the same value shows up.
  useLayoutEffect(() => {
    if (!tweening.current && ref.current) ref.current.textContent = text(shown.current);
  });

  // Layout effect: the start value is written before paint, so the final value never flashes first.
  useLayoutEffect(() => {
    const el = ref.current;
    const from = shown.current;
    if (!el) return;
    if (value === null || from === null || from === value || reduced) {
      shown.current = value;
      el.textContent = text(value);
      return;
    }
    el.textContent = text(from);
    tweening.current = true;
    const controls = animate(from, value, {
      ...semanticMotion.countUp,
      onUpdate: (v) => {
        shown.current = v;
        el.textContent = text(v);
      },
      onComplete: () => {
        tweening.current = false;
        shown.current = value;
        el.textContent = text(value);
      },
    });
    return () => {
      // Interrupted (a new value arrived): the next tween starts from where this one stopped.
      tweening.current = false;
      controls.stop();
    };
    // `text` reads the latest format through a ref; re-running on its identity would restart tweens.
  }, [value, reduced]);

  return (
    <>
      <span ref={ref} aria-hidden="true" className={className} data-count-up>
        {text(value)}
      </span>
      <span className="sr-only">{text(value)}</span>
    </>
  );
}
