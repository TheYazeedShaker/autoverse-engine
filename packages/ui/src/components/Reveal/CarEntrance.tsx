"use client";

import { motion } from "motion/react";
import { useReducedMotionPreference } from "../../use-reduced-motion";
import type { ReactNode } from "react";
import { semanticMotion } from "../../motion";
import { useSeenOnce } from "./Reveal";

// CarEntrance — a card's car drives into place as the card scrolls into view (slice 8; the approved
// card's `carIn`): from behind the car, fading in. The side view faces right and the frame mirrors
// it in RTL (ADR 0022), so one offset reads correctly in both directions. Transform and opacity
// only. Reduced motion, or a card already in view at load: the car is simply there.
//
// It replaces the frame's image layer (the element carrying the drop-shadow filter), so the moving
// layer composites its shadow once instead of repainting a filtered parent every frame.

export function CarEntrance({ children, className }: { children: ReactNode; className?: string }) {
  const reduced = useReducedMotionPreference();
  const { ref, waiting, animate } = useSeenOnce<HTMLDivElement>(0.25);
  const { duration, ease, delay, distance } = semanticMotion.carEntrance;
  return (
    <motion.div
      ref={ref}
      data-car-entrance
      data-car-image
      className={className}
      initial={false}
      animate={waiting ? { opacity: 0, x: `-${distance}` } : { opacity: 1, x: 0 }}
      transition={animate && !reduced ? { duration, ease, delay } : { duration: 0 }}
    >
      {children}
    </motion.div>
  );
}
