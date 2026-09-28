"use client";

import { motion, useReducedMotion } from "motion/react";
import { prefersReducedMotionNow } from "../../use-reduced-motion";
import { useEffect, useState, type ReactNode } from "react";
import { semanticMotion } from "../../motion";

// IntroCurtain — the showroom's once-per-session opening (spec §5.1), rebuilt from the approved
// page: a dark full-screen curtain with the brand's mark, lifting off the page once the first hero
// image has decoded (capped at ~900 ms). Any input (a pointer, a key, the wheel) lifts it at once.
//
// - Once per session, read synchronously: INTRO_CURTAIN_SCRIPT (rendered just before the curtain)
//   marks <html data-intro-seen> from sessionStorage before the curtain paints, and CSS hides the
//   curtain then. It is never shown and then hidden, and needs no JavaScript to stay hidden.
// - Reduced motion: never rendered (CSS hides it; the component unmounts it).
// - Never covers the page for good: a CSS failsafe (`av-curtain-failsafe`, the
//   delayCurtainFailsafe token) hides it even if no JavaScript runs. The JavaScript cap counts
//   from navigation start, not from hydration.
// - Decorative and aria-hidden: the page under it is the content. It lifts on the first key, so a
//   keyboard user is never tabbing behind it.
// - Motion: `curtainLift`, or `curtainSkip` when the visitor cuts it short (transform only).

export const INTRO_STORAGE_KEY = "av-intro-seen";
/** Hard cap before the curtain lifts, whether or not the hero image has decoded (spec §5.1). */
export const INTRO_CAP_MS = 900;

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
      html.setAttribute("data-intro-seen", "");
      try {
        sessionStorage.setItem(INTRO_STORAGE_KEY, "1");
      } catch {
        // Storage refused (private mode, a policy): the curtain may show again next page. Harmless.
      }
      setFast(skip);
      setPhase("lifting");
    };
    // The cap counts from navigation start: a slow hydration must not lengthen the cover.
    const cap = window.setTimeout(() => lift(false), Math.max(0, INTRO_CAP_MS - performance.now()));
    const img = document.querySelector<HTMLImageElement>(readySelector);
    img
      ?.decode?.()
      .then(() => lift(false))
      .catch(() => lift(false));
    const skip = () => lift(true);
    window.addEventListener("pointerdown", skip);
    window.addEventListener("keydown", skip);
    window.addEventListener("wheel", skip, { passive: true });
    window.addEventListener("touchstart", skip, { passive: true });
    return () => {
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
      animate={{ y: phase === "lifting" ? semanticMotion.curtainLift.offstage : "0%" }}
      transition={fast ? semanticMotion.curtainSkip : semanticMotion.curtainLift}
      onAnimationComplete={() => {
        if (phase === "lifting") setPhase("gone");
      }}
      className="av-curtain-failsafe bg-surface-dark text-on-dark fixed inset-0 z-60 flex items-center justify-center motion-reduce:hidden [html[data-intro-seen]_&]:hidden"
    >
      <span className="flex items-center text-2xl font-semibold tracking-tight rtl:tracking-normal">
        {logo ?? brandName}
      </span>
    </motion.div>
  );
}
