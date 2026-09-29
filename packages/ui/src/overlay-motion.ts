import { semanticMotion } from "./motion";

// Enter/exit motion for the Radix overlays, on the motion standard (ADR 0026):
// - the spec drawer (a side panel from the inline end) and the filter sheet (from the bottom):
//   the overlay pair, 500 ms, transform only, enter and exit alike, the backdrop on the same pair;
// - the lead modal (rising in with a fade): the modal pair, 300 ms, enter and exit alike.
// The surface animates the `transform` property itself (a string), not motion's `x`/`y`: motion
// then hands it to the browser as a Web Animation on the compositor, the same as the backdrop's
// opacity. Driven as `x` from JavaScript it ran frame by frame on the main thread, which the drawer's
// own render starved: the slide looked fast and un-eased (owner, checked with getAnimations()).
//
// Radix keeps the focus trap, Escape, scroll lock and focus return; motion/react's AnimatePresence
// keeps an overlay mounted until its exit finishes (Radix `forceMount`). Reduced motion: no
// movement, no fade: the overlay is there, then gone.

export type OverlayKind = "side" | "sheet" | "modal";

// Resting and away positions carry the SAME units per kind: motion interpolates the strings, and a
// bare 0 against "1.5rem" produced an invalid unitless transform mid-flight (measured in the browser).
const resting: Record<OverlayKind, string> = {
  side: "translate(0%, 0%)",
  sheet: "translate(0%, 0%)",
  modal: "translate(0rem, 0rem)",
};
const pairOf = (kind: OverlayKind) =>
  kind === "modal" ? semanticMotion.modal : semanticMotion.overlay;

/** Props for the overlay's surface (a motion element under Dialog.Content asChild). */
export function overlaySurface(kind: OverlayKind, dir: "ltr" | "rtl", reduced: boolean | null) {
  const still = { opacity: 1, transform: resting[kind] };
  if (reduced) {
    return { initial: still, animate: still, exit: still, transition: { duration: 0 } };
  }
  const away =
    kind === "side"
      ? // The inline end: the right in LTR, the left in RTL. The panel travels its own width.
        { opacity: 1, transform: `translate(${dir === "rtl" ? "-100%" : "100%"}, 0%)` }
      : kind === "sheet"
        ? { opacity: 1, transform: "translate(0%, 100%)" }
        : { opacity: 0, transform: `translate(0rem, ${semanticMotion.modalDistance})` };
  const pair = pairOf(kind);
  return { initial: away, animate: still, exit: { ...away, transition: pair }, transition: pair };
}

/** Props for the overlay's backdrop (a motion element under Dialog.Overlay asChild), in sync. */
export function overlayScrim(reduced: boolean | null, kind: OverlayKind) {
  if (reduced) {
    return {
      initial: { opacity: 1 },
      animate: { opacity: 1 },
      exit: { opacity: 1 },
      transition: { duration: 0 },
    };
  }
  const pair = pairOf(kind);
  return {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0, transition: pair },
    transition: pair,
  };
}
