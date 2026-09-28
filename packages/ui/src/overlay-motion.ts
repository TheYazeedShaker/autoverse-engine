import { semanticMotion } from "./motion";

// Enter/exit motion for the Radix overlays (slice 8): the spec drawer (a side panel from the inline
// end), the filter sheet (from the bottom) and the lead modal (rising in). Radix keeps the focus
// trap, Escape, scroll lock and focus return; motion/react's AnimatePresence keeps the overlay
// mounted until its exit finishes (Radix `forceMount`). Transform and opacity only. Reduced motion:
// no movement, no fade: the overlay is there, then gone.

export type OverlayKind = "side" | "sheet" | "modal";

const still = { opacity: 1, x: 0, y: 0 };

/** Props for the overlay's surface (a motion element under Dialog.Content asChild). */
export function overlaySurface(kind: OverlayKind, dir: "ltr" | "rtl", reduced: boolean | null) {
  if (reduced) {
    return { initial: still, animate: still, exit: still, transition: { duration: 0 } };
  }
  const away =
    kind === "side"
      ? // The inline end: the right in LTR, the left in RTL. The panel travels its own width.
        { x: dir === "rtl" ? "-100%" : "100%" }
      : kind === "sheet"
        ? { y: "100%" }
        : { opacity: 0, y: semanticMotion.overlayDistance };
  return {
    initial: away,
    animate: still,
    exit: { ...away, transition: semanticMotion.overlayOut },
    transition: semanticMotion.overlayIn,
  };
}

/** Props for the overlay's scrim (a motion element under Dialog.Overlay asChild). */
export function overlayScrim(reduced: boolean | null) {
  if (reduced) {
    return {
      initial: { opacity: 1 },
      animate: { opacity: 1 },
      exit: { opacity: 1 },
      transition: { duration: 0 },
    };
  }
  return {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
    transition: semanticMotion.scrimFade,
  };
}
