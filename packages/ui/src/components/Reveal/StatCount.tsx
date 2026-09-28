"use client";

import { animate as tween, motion, useMotionValue } from "motion/react";
import { useEffect, useMemo } from "react";
import { semanticMotion } from "../../motion";
import { useReducedMotionPreference } from "../../use-reduced-motion";
import { useSeenOnce } from "./Reveal";

// StatCount — a card's figure counting up from zero once the card is seen (slice 8; the approved
// card's `animateNumber`). The props are plain data, so a server component (VehicleCard) can render
// it: the final text is formatted on the server, and the tween formats with the same locale and
// numbering system, so its digits match. A motion value drives the text (React keeps its own node);
// the counting span is aria-hidden and assistive tech reads the final value from a visually hidden
// twin. Tabular digits, so the count never changes the stat's width. Reduced motion, or a card
// already in view: the final value, no count.

export interface StatCountProps {
  /** The formatted final value, e.g. "420" or "٦٫٤". */
  final: string;
  to: number;
  fractionDigits: number;
  locale: string;
  numberingSystem: string;
}

export function StatCount({ final, to, fractionDigits, locale, numberingSystem }: StatCountProps) {
  const reduced = useReducedMotionPreference();
  const { ref, waiting, animate } = useSeenOnce<HTMLSpanElement>(0.25);
  const text = useMotionValue(final);
  const format = useMemo(
    () =>
      new Intl.NumberFormat(locale, {
        numberingSystem,
        minimumFractionDigits: fractionDigits,
        maximumFractionDigits: fractionDigits,
      }),
    [locale, numberingSystem, fractionDigits],
  );

  useEffect(() => {
    if (waiting) {
      text.set(format.format(0));
      return;
    }
    if (!animate || reduced || text.get() === final) {
      text.set(final);
      return;
    }
    const controls = tween(0, to, {
      ...semanticMotion.statCount,
      onUpdate: (v) => text.set(format.format(v)),
      onComplete: () => text.set(final),
    });
    return () => controls.stop();
  }, [waiting, animate, reduced, final, to, format, text]);

  return (
    <>
      <motion.span ref={ref} aria-hidden="true" data-stat-count className="tabular-nums">
        {text}
      </motion.span>
      <span className="sr-only">{final}</span>
    </>
  );
}
