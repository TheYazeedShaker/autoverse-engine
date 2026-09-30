"use client";

import { motion, useReducedMotion } from "motion/react";
import { prefersReducedMotionNow } from "../../use-reduced-motion";
import { useEffect, useState, type ReactNode } from "react";
import { semanticMotion } from "../../motion";

// IntroCurtain — the showroom's once-per-session opening (spec §5.1), rebuilt from the approved
// page: a dark full-screen curtain with the brand's mark. It stays at least `curtainHoldMs` (~1.2 s,
// owner) from navigation start, then lifts smoothly (~0.8 s) once the first hero image has decoded,
// waiting for that at most until `curtainHoldMaxMs`. Any input (a pointer, a key, the wheel) lifts
// it at once.
//
// - Once per session, read synchronously: INTRO_CURTAIN_SCRIPT (rendered just before the curtain)
//   marks <html data-intro-seen> from sessionStorage before the curtain paints, and CSS hides the
//   curtain then. It is never shown and then hidden, and needs no JavaScript to stay hidden.
// - Reduced motion: never rendered (CSS hides it; the component unmounts it).
// - Never covers the page for good: a CSS failsafe (`av-curtain-failsafe`, the
//   delayCurtainFailsafe token, above the hold max plus the lift) hides it even if no JavaScript
//   runs. The hold and its max count from navigation start, not from hydration.
// - Lifting writes the session flag only. It must NOT set <html data-intro-seen>: that attribute's
//   CSS hides the curtain at once, which would cut the lift (the slice-8 review found exactly that).
//   A remount in the same document reads the flag from storage instead.
// - Decorative and aria-hidden: the page under it is the content. It lifts on the first key, so a
//   keyboard user is never tabbing behind it.
// - Motion: `curtainLift`, or `curtainSkip` when the visitor cuts it short (transform only).

export const INTRO_STORAGE_KEY = "av-intro-seen";
/** The least time on screen, and the latest it waits for the hero image, from navigation start. */
export const INTRO_HOLD_MS = semanticMotion.curtainHoldMs;
export const INTRO_HOLD_MAX_MS = semanticMotion.curtainHoldMaxMs;

/**
 * Runs before the curtain is parsed: marks the page when the curtain was already seen this
 * session. It is rendered as an inline script, so it must stay a CONSTANT: never build it from
 * props, request or brand data (security review). A future CSP allows it by its sha256 hash
 * (ADR 0026); any edit to this string changes the hash.
 */
export const INTRO_CURTAIN_SCRIPT = `try{if(sessionStorage.getItem(${JSON.stringify(
  INTRO_STORAGE_KEY,
)}))document.documentElement.setAttribute("data-intro-seen","")}catch(e){}`;

export interface IntroCurtainProps {
  /** The brand's mark for a dark surface (logo_dark), or null for the wordmark. */
  logo: ReactNode | null;
  brandName: string;
  /** The image the curtain waits for (the page's one high-priority hero image). */
  readySelector?: string;
}

type Phase = "cover" | "lifting" | "gone";

export function IntroCurtain({
  logo,
  brandName,
  readySelector = 'img[fetchpriority="high"]',
}: IntroCurtainProps) {
  const reduced = useReducedMotion();
  const [phase, setPhase] = useState<Phase>("cover");
  const [fast, setFast] = useState(false);

  useEffect(() => {
    const html = document.documentElement;
    let stored = false;
    try {
      stored = sessionStorage.getItem(INTRO_STORAGE_KEY) !== null;
    } catch {
      // Storage refused: fall back to the attribute alone.
    }
    // The attribute covers a full load (the inline script); storage covers a remount in the same
    // document (a client navigation back to the page), where React doesn't run the script again.
    if (html.hasAttribute("data-intro-seen") || stored || prefersReducedMotionNow() || reduced) {
      setPhase("gone");
      return;
    }
    let done = false;
    const lift = (skip: boolean) => {
      if (done) return;
      done = true;
      try {
        sessionStorage.setItem(INTRO_STORAGE_KEY, "1");
      } catch {
        // Storage refused (private mode, a policy): the curtain may show again next page. Harmless.
      }
      setFast(skip);
      setPhase("lifting");
    };
    // Both clocks count from navigation start: a slow hydration must not lengthen the cover.
    const img = document.querySelector<HTMLImageElement>(readySelector);
    let decoded = !img?.decode;
    let cancelled = false;
    let held = false;
    const settle = () => {
      if (!cancelled && decoded && held) lift(false);
    };
    const hold = window.setTimeout(
      () => {
        held = true;
        settle();
      },
      Math.max(0, INTRO_HOLD_MS - performance.now()),
    );
    const cap = window.setTimeout(
      () => lift(false),
      Math.max(0, INTRO_HOLD_MAX_MS - performance.now()),
    );
    img
      ?.decode?.()
      .catch(() => undefined)
      .then(() => {
        decoded = true;
        settle();
      });
    const skip = () => lift(true);
    window.addEventListener("pointerdown", skip);
    window.addEventListener("keydown", skip);
    window.addEventListener("wheel", skip, { passive: true });
    window.addEventListener("touchstart", skip, { passive: true });
    return () => {
      cancelled = true;
      window.clearTimeout(hold);
      window.clearTimeout(cap);
      window.removeEventListener("pointerdown", skip);
      window.removeEventListener("keydown", skip);
      window.removeEventListener("wheel", skip);
      window.removeEventListener("touchstart", skip);
    };
  }, [readySelector, reduced]);

  if (phase === "gone") return null;
  return (
    <motion.div
      data-intro-curtain
      aria-hidden="true"
      initial={false}
      animate={{
        transform:
          phase === "lifting"
            ? semanticMotion.curtainLift.offstage
            : semanticMotion.curtainLift.onstage,
      }}
      transition={fast ? semanticMotion.curtainSkip : semanticMotion.curtainLift}
      onAnimationComplete={() => {
        if (phase === "lifting") setPhase("gone");
      }}
      className="av-curtain-failsafe bg-surface-curtain text-on-curtain fixed inset-0 z-60 flex items-center justify-center motion-reduce:hidden [html[data-intro-seen]_&]:hidden"
    >
      <span className="flex items-center text-2xl font-semibold tracking-tight rtl:tracking-normal">
        {logo ?? brandName}
      </span>
    </motion.div>
  );
}
