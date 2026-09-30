"use client";

import { useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";

// The one reduced-motion signal for components (slice 8). motion's useReducedMotion reads the media
// query once and caches it; this also reads it directly and follows changes, so a preference set
// while the page is open wins, and tests can drive it through matchMedia. Every animated component
// routes through this (or motion's hook) so the reduced-motion gate holds.

export function useReducedMotionPreference(): boolean {
  const fromMotion = useReducedMotion();
  const [fromMedia, setFromMedia] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mq) return;
    setFromMedia(mq.matches);
    const onChange = () => setFromMedia(mq.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);
  return Boolean(fromMotion) || fromMedia;
}

/** Synchronous read, for effects that decide once at mount. */
export function prefersReducedMotionNow(): boolean {
  return (
    typeof window !== "undefined" &&
    Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches)
  );
}
