import { motion as tokens } from "@autoverse/tokens";

// Semantic motion: components name WHAT moves and why; this maps it onto the showroom motion
// standard (ADR 0026), whose four duration/curve pairs are the only motion tokens. Components never
// hold raw durations or curves. Every entry is instant under reduced motion (the components route
// through use-reduced-motion.ts).
//
// - overlay (the drawer and the filter sheet, and their backdrop): 500 ms, one curve, enter = exit,
//   transform only.
// - modal (the lead modal and its backdrop): 300 ms, one curve, enter = exit.
// - move (on-screen movement): the dock marker, the carousel settle, a trim image crossfade,
//   a chevron turning. 250 ms, ease-in-out.
// - hovers, colour/state changes and the dock appearing use the modal pair (a quick ease-out):
//   they are feedback or UI entering, which the standard keeps off ease-in-out (pending the
//   owner's confirmation in #build-decisions).
// - reveal (scroll reveals, a card's car entrance, figures counting up): 500 ms ease-out, the
//   stagger unchanged.
// - curtain: the 1.2 s hold, then an 800 ms lift on the overlay curve; the visitor's first input
//   lifts it on the modal pair (a quick ease-out, never ease-in).

/** A cubic-bezier token as motion/react's array. */
function bezier(css: string): [number, number, number, number] {
  const m = /cubic-bezier\(([^)]+)\)/.exec(css);
  const values = m ? m[1]!.split(",").map((v) => Number(v.trim())) : [];
  if (values.length !== 4 || values.some((v) => Number.isNaN(v))) {
    throw new Error(`motion token is not a cubic-bezier: ${css}`);
  }
  return values as [number, number, number, number];
}

const seconds = (ms: number) => ms / 1000;
const overlay = { duration: seconds(tokens.durationOverlay), ease: bezier(tokens.easingOverlay) };
const modal = { duration: seconds(tokens.durationModal), ease: bezier(tokens.easingModal) };
const move = { duration: seconds(tokens.durationMove), ease: bezier(tokens.easingMove) };
const reveal = { duration: seconds(tokens.durationReveal), ease: bezier(tokens.easingReveal) };

export const semanticMotion = {
  /** The drawer and the filter sheet, and their backdrop: enter and exit alike. */
  overlay,
  /** The lead modal and its backdrop: enter and exit alike. */
  modal,
  /** How far the lead modal rises in. The drawer and the sheet travel their own size. */
  modalDistance: tokens.distanceOverlay,
  /** The dock's active marker sliding to the picked model. */
  pillSlide: { type: "tween", ...move },
  /** The hero swapping a trim's image (opacity). */
  crossfade: move,
  /** A hero stat tweening from the previous model's value. */
  countUp: reveal,
  /**
   * The hero carousel settling on a model (Embla). Embla's settle is its own damped spring on a
   * fixed 60 fps step (v += gap / duration; v *= 0.68): `duration` is in steps, not ms, and it
   * takes no curve. Simulated (Embla v8.6 ScrollBody): 15 steps (250 ms / 16.7 ms) would reach 95%
   * at 250 ms but overshoot 1.06% (~15 px on a wide slide, a visible bounce); 18 reaches 95% at
   * ~317 ms with 0.14% overshoot (~2 px, invisible), the closest to the move token without a bounce
   * (ADR 0026). It governs programmatic moves (arrows, dock, keys); a drag release settles on
   * Embla's own speed. Reduced motion: 1, effectively instant.
   */
  carouselSettle: { duration: 18, reducedDuration: 1 },
  sectionReveal: {
    ...reveal,
    /** Seconds between one reveal level and the next. */ stagger: seconds(tokens.staggerReveal),
  },
  carEntrance: { ...reveal, delay: 0, distance: tokens.distanceEntrance },
  statCount: reveal,
  curtainLift: {
    duration: seconds(tokens.durationCurtain),
    ease: bezier(tokens.easingOverlay),
    /** At rest, and where it goes: fully off the top, plus a hair so its edge never shows. The
     *  transform property itself, with matching units, so it runs on the compositor. */
    onstage: "translate(0%, 0%)",
    offstage: "translate(0%, -101%)",
  },
  curtainSkip: modal,
  /** The curtain's least time on screen, and the latest it waits for the hero image (ms). */
  curtainHoldMs: tokens.durationCurtainHold,
  curtainHoldMaxMs: tokens.durationCurtainHoldMax,
} as const;

/** A transition that respects reduced motion: instant when reduced. */
export function safeTransition<T extends object>(transition: T, reduced: boolean | null) {
  return reduced ? { duration: 0 } : transition;
}
