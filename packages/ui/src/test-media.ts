import { vi } from "vitest";

/** Stubs window.matchMedia so the given queries match (e.g. reduced motion, a min-width). */
export function stubMedia(matches: (query: string) => boolean) {
  return vi.spyOn(window, "matchMedia").mockImplementation(
    (q: string) =>
      ({
        matches: matches(q),
        media: q,
        addEventListener() {},
        removeEventListener() {},
        addListener() {},
        removeListener() {},
        onchange: null,
        dispatchEvent: () => false,
      }) as MediaQueryList,
  );
}

/** One macrotask: long enough for an instant (reduced-motion) exit, far shorter than any motion. */
export const tick = () => new Promise((r) => setTimeout(r, 0));
