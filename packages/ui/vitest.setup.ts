import "@testing-library/jest-dom/vitest";
import { toHaveNoViolations } from "jest-axe";
import { expect } from "vitest";

// axe matcher for component-level a11y assertions (jsdom: role/name/aria checks; colour-contrast is not
// computed here — that's covered by the token invariant tests + the Storybook axe gate).
expect.extend(toHaveNoViolations);

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
