// Scroll-spy (spec §5.4), pure so it is unit tested: which model section is "current".
//
// - The anchor line sits 30% down the viewport; the current section is the one that line crosses.
// - At the bottom of the page the last section is current, even if it is too short to reach the line.
// - Between sections (the line in a gap) or above the first one: no change (null).
//
// While the page scrolls programmatically (a dock pick), the caller suspends the spy until
// `scrollend`, so the dock doesn't flicker through every section on the way.

export const SPY_LINE = 0.3;
/** Fallback release for the hold where `scrollend` isn't supported (or never fires). */
export const SPY_HOLD_MS = 1600;

/**
 * The spy's suspension during a programmatic scroll. `hold()` suspends it until the next `scrollend`
 * or the timeout, whichever comes first. A new hold first releases the previous one's listener and
 * timer, so an earlier pick's timeout can never lift a later pick's hold early.
 */
export function createSpyHold(
  target: Pick<Window, "addEventListener" | "removeEventListener" | "setTimeout" | "clearTimeout">,
  timeoutMs = SPY_HOLD_MS,
) {
  let held = false;
  let pending: (() => void) | null = null;
  const release = () => {
    pending?.();
  };
  return {
    isHeld: () => held,
    hold() {
      release();
      held = true;
      let timer = 0;
      const done = () => {
        held = false;
        pending = null;
        target.removeEventListener("scrollend", done);
        target.clearTimeout(timer);
      };
      pending = done;
      target.addEventListener("scrollend", done);
      timer = target.setTimeout(done, timeoutMs);
    },
    release,
  };
}

export interface SectionBox {
  id: string;
  start: number;
  end: number;
}

export function currentSection(
  sections: readonly SectionBox[],
  viewportHeight: number,
  atBottom: boolean,
): string | null {
  if (sections.length === 0) return null;
  if (atBottom) return sections[sections.length - 1]!.id;
  const line = viewportHeight * SPY_LINE;
  return sections.find((s) => s.start <= line && s.end > line)?.id ?? null;
}
