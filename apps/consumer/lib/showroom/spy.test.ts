import { describe, expect, it, vi } from "vitest";
import { createSpyHold, currentSection, SPY_HOLD_MS } from "./spy";

describe("createSpyHold", () => {
  const target = () => {
    const events = new EventTarget();
    return Object.assign(events, {
      setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms) as unknown as number,
      clearTimeout: (id: number) => clearTimeout(id),
    }) as unknown as Parameters<typeof createSpyHold>[0] & EventTarget;
  };

  it("holds until scrollend", () => {
    const t = target();
    const hold = createSpyHold(t);
    hold.hold();
    expect(hold.isHeld()).toBe(true);
    t.dispatchEvent(new Event("scrollend"));
    expect(hold.isHeld()).toBe(false);
  });

  it("releases on the timeout when scrollend never comes", () => {
    vi.useFakeTimers();
    const hold = createSpyHold(target());
    hold.hold();
    vi.advanceTimersByTime(SPY_HOLD_MS - 1);
    expect(hold.isHeld()).toBe(true);
    vi.advanceTimersByTime(1);
    expect(hold.isHeld()).toBe(false);
    vi.useRealTimers();
  });

  it("an earlier pick's timeout never lifts a later pick's hold", () => {
    vi.useFakeTimers();
    const hold = createSpyHold(target());
    hold.hold();
    vi.advanceTimersByTime(SPY_HOLD_MS - 100);
    hold.hold(); // a second pick
    vi.advanceTimersByTime(200); // past the first pick's deadline
    expect(hold.isHeld()).toBe(true);
    vi.advanceTimersByTime(SPY_HOLD_MS);
    expect(hold.isHeld()).toBe(false);
    vi.useRealTimers();
  });
});

const S = [
  { id: "a", start: -500, end: 100 },
  { id: "b", start: 140, end: 900 },
  { id: "c", start: 940, end: 1300 },
];

describe("currentSection", () => {
  it("is the section the 30% line crosses", () => {
    // Viewport 1000 → the line is at 300, inside b.
    expect(currentSection(S, 1000, false)).toBe("b");
    // Viewport 300 → the line at 90, inside a.
    expect(currentSection(S, 300, false)).toBe("a");
  });

  it("is the last section at the bottom of the page, even a short one", () => {
    expect(currentSection(S, 1000, true)).toBe("c");
  });

  it("is null in a gap or above the first section (no change)", () => {
    expect(currentSection(S, 400, false)).toBeNull(); // line at 120: the gap between a and b
    expect(currentSection([{ id: "a", start: 600, end: 900 }], 1000, false)).toBeNull();
    expect(currentSection([], 1000, true)).toBeNull();
  });
});
