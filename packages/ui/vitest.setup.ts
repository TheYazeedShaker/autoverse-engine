import "@testing-library/jest-dom/vitest";
import { toHaveNoViolations } from "jest-axe";
import { expect } from "vitest";

// axe matcher for component-level a11y assertions (jsdom: role/name/aria checks; colour-contrast is not
// computed here — that's covered by the token invariant tests + the Storybook axe gate).
expect.extend(toHaveNoViolations);

// jsdom has no layout observers or media queries. Embla (ModelCarousel) and motion need them to
// mount; these inert stand-ins let the components run (layout itself is checked in the browser).
class InertObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}
const g = globalThis as Record<string, unknown>;
g.ResizeObserver ??= InertObserver;
g.IntersectionObserver ??= InertObserver;
if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}

// jest-axe ships only jest types, so teach vitest's expect about the matcher. The `Assertion` generic
// default must match vitest's own (`any`) — TS requires identical type parameters when merging.
declare module "vitest" {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  interface Assertion<T = any> {
    toHaveNoViolations(): T;
  }
  interface AsymmetricMatchersContaining {
    toHaveNoViolations(): void;
  }
}
