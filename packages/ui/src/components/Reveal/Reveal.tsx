"use client";

import { motion, useReducedMotion } from "motion/react";
import { prefersReducedMotionNow } from "../../use-reduced-motion";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "../../cn";
import { semanticMotion } from "../../motion";

// Reveal and its helpers — scroll-into-view motion for the showroom (slice 8, from the approved page).
//
// - Server-rendered visible. Only what starts BELOW the fold is hidden, after hydration, and then
//   revealed as it scrolls in: nothing is ever invisible without JavaScript, and nothing the
//   visitor is already looking at flickers.
// - Reduced motion: nothing is hidden or moved; everything is present from the start.
// - `useSeenOnce` is the shared trigger: true once an element that started below the fold has been
//   seen (IntersectionObserver). Elements already in view at mount count as seen at once.

/** Whether an element starts below the fold, and, if so, whether it has been seen since. */
export function useSeenOnce<T extends Element>(threshold: number) {
  const ref = useRef<T>(null);
  const reduced = useReducedMotion();
  // "pending" until mount decides: SSR and the first client render show the final state.
  // "still": reduced motion, so nothing moves at all.
  const [state, setState] = useState<"pending" | "waiting" | "seen" | "still">("pending");

  useEffect(() => {
    const el = ref.current;
    // Read the preference directly too: motion's hook caches it, and a change must still win.
    if (reduced || prefersReducedMotionNow()) {
      setState("still");
      return;
    }
    if (!el || typeof IntersectionObserver === "undefined") {
      setState("seen");
      return;
    }
    if (el.getBoundingClientRect().top < window.innerHeight) {
      setState("seen");
      return;
    }
    setState("waiting");
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setState("seen");
          io.disconnect();
        }
      },
      { threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [reduced, threshold]);

  return { ref, waiting: state === "waiting", animate: state === "seen" && !reduced };
}

export interface RevealProps {
  children: ReactNode;
  /** The stagger level: 0 for a header, 1 for what follows it (as approved). */
  level?: number;
  className?: string;
}

/** Fades its content in (opacity only) when it scrolls into view. */
export function Reveal({ children, level = 0, className }: RevealProps) {
  const { ref, waiting } = useSeenOnce<HTMLDivElement>(0.18);
  const { duration, ease, stagger } = semanticMotion.sectionReveal;
  return (
    <motion.div
      ref={ref}
      data-reveal={level}
      initial={false}
      animate={{ opacity: waiting ? 0 : 1 }}
      transition={waiting ? { duration: 0 } : { duration, ease, delay: level * stagger }}
      className={cn(className)}
    >
      {children}
    </motion.div>
  );
}
