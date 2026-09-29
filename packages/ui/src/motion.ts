import { motion as tokens } from "@autoverse/tokens";

// Semantic motion (motion REV §M3): components name WHAT moves and why, and this maps it onto the
// motion tokens. Components never use raw durations or curves. Every entry has a reduced-motion
// behaviour, applied by the component through motion/react's useReducedMotion():
//
// - countUp: a hero stat tweens from the previous model's value (spec §5.3). Reduced: jumps.
// - pillSlide: the dock's active pill slides to the picked model (the `segmented-switch` row of the
//   REV: transform only). Reduced: jumps.
// - crossfade: the hero swaps a trim's image (the `view-transition` row: opacity only). Reduced:
//   instant.
// - carouselSettle: the hero carousel settling on a model. Reduced: instant.
//
// Slice 8 (motion polish; ADR 0026), from the approved showroom's timings:
// - curtainLift: the intro curtain rises off the page (transform). Reduced: never rendered.
// - curtainSkip: the same, cut short by the visitor's first input.
// - sectionReveal: a section header or a card fades in as it scrolls into view, one stagger step
//   per level (opacity only, as approved). Reduced: present from the start.
// - carEntrance: a card's car drives in from behind (transform + opacity). Reduced: in place.
// - statCount: a card's figures count up from zero once it is seen. Reduced: final values.
// - overlayIn / overlayOut: the drawer, the filter sheet and the lead modal land (transform) over a
//   scrim fading in step with them. Reduced: instant.
// Durations and curves come from the tokens only; components never hold raw values.

/** The standard easing token as motion/react's cubic-bezier array. */
function bezier(css: string): [number, number, number, number] {
  const m = /cubic-bezier\(([^)]+)\)/.exec(css);
  const values = m ? m[1]!.split(",").map((v) => Number(v.trim())) : [];
  if (values.length !== 4 || values.some((v) => Number.isNaN(v))) {
    throw new Error(`motion token is not a cubic-bezier: ${css}`);
  }
  return values as [number, number, number, number];
}

const standard = bezier(tokens.easingStandard);
const gentle = bezier(tokens.easingGentle);
const seconds = (ms: number) => ms / 1000;

export const semanticMotion = {
  countUp: { duration: seconds(tokens.durationSlow), ease: standard },
  pillSlide: { type: "tween", duration: seconds(tokens.durationBase), ease: standard },
  crossfade: { duration: seconds(tokens.durationSlow), ease: standard },
  /**
   * The hero carousel settling on a model (Embla). Embla's `duration` is in its own units (its
   * scroll-body friction), not ms: 28 gives a settle close to the slow duration token. Reduced
   * motion: 1, effectively instant (programmatic moves also jump outright).
   */
  carouselSettle: { duration: 28, reducedDuration: 1 },
  curtainLift: {
    duration: seconds(tokens.durationCurtain),
    ease: bezier(tokens.easingCurtain),
    /** Where the curtain goes: fully off the top, plus a hair so its edge never shows. */
    offstage: "-101%",
  },
  curtainSkip: { duration: seconds(tokens.durationBase), ease: bezier(tokens.easingCurtain) },
  /** The curtain's least time on screen, and the latest it waits for the hero image (ms). */
  curtainHoldMs: tokens.durationCurtainHold,
  curtainHoldMaxMs: tokens.durationCurtainHoldMax,
  sectionReveal: {
    duration: seconds(tokens.durationReveal),
    ease: bezier(tokens.easingReveal),
    /** Seconds between one reveal level and the next. */
    stagger: seconds(tokens.staggerReveal),
  },
  carEntrance: {
    duration: seconds(tokens.durationEntrance),
    ease: bezier(tokens.easingEntrance),
    delay: seconds(tokens.delayEntrance),
    distance: tokens.distanceEntrance,
  },
  statCount: { duration: seconds(tokens.durationCount), ease: bezier(tokens.easingDecelerate) },
  // Overlays and their scrim share one duration and one gentle ease-out, in and out, so they move
  // in sync (owner, slice 8 review).
  overlayIn: { duration: seconds(tokens.durationOverlay), ease: gentle },
  overlayOut: { duration: seconds(tokens.durationOverlayOut), ease: gentle },
  /** How far the lead modal's panel rises in. The drawer and the sheet travel their own size. */
  overlayDistance: tokens.distanceOverlay,
} as const;

/** A transition that respects reduced motion: instant when reduced. */
export function safeTransition<T extends object>(transition: T, reduced: boolean | null) {
  return reduced ? { duration: 0 } : transition;
}
