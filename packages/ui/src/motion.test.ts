import { motion as tokens } from "@autoverse/tokens";
import { describe, expect, it } from "vitest";
import { semanticMotion } from "./motion";

// The motion standard (ADR 0026), pinned where components read it: every semantic motion maps
// onto one of the owner's pairs.

const curve = (css: string) =>
  css
    .slice("cubic-bezier(".length, -1)
    .split(",")
    .map((v) => Number(v.trim()));
const pair = (ms: number, css: string) => ({ duration: ms / 1000, ease: curve(css) });

const overlay = pair(tokens.durationOverlay, tokens.easingOverlay);
const modal = pair(tokens.durationModal, tokens.easingModal);
const move = pair(tokens.durationMove, tokens.easingMove);
const reveal = pair(tokens.durationReveal, tokens.easingReveal);

describe("semantic motion follows the standard", () => {
  it.each([
    ["overlay (drawer, sheet)", semanticMotion.overlay, overlay],
    ["modal", semanticMotion.modal, modal],
    ["curtainSkip", semanticMotion.curtainSkip, modal],
    ["crossfade", semanticMotion.crossfade, move],
    ["countUp", semanticMotion.countUp, reveal],
    ["statCount", semanticMotion.statCount, reveal],
  ] as const)("%s", (_name, actual, expected) => {
    expect({ duration: actual.duration, ease: actual.ease }).toEqual(expected);
  });

  it("the dock marker is the move pair (as a tween)", () => {
    const { type, duration, ease } = semanticMotion.pillSlide;
    expect(type).toBe("tween");
    expect({ duration, ease }).toEqual(move);
  });

  it("reveals and the car entrance are the reveal pair; the stagger is 120 ms", () => {
    const r = semanticMotion.sectionReveal;
    expect({ duration: r.duration, ease: r.ease }).toEqual(reveal);
    expect(r.stagger).toBe(0.12);
    const c = semanticMotion.carEntrance;
    expect({ duration: c.duration, ease: c.ease }).toEqual(reveal);
  });

  it("the curtain lifts over 800 ms on the overlay curve, after the 1.2 s hold", () => {
    const l = semanticMotion.curtainLift;
    expect(l.duration).toBe(0.8);
    expect(l.ease).toEqual(overlay.ease);
    expect(semanticMotion.curtainHoldMs).toBe(1200);
  });

  it("the carousel settle is Embla 18 steps (no visible overshoot; ADR 0026)", () => {
    expect(semanticMotion.carouselSettle.duration).toBe(18);
  });

  it("the move curve eases in AND out (y1 = 0, y2 = 1), never a plain ease-in", () => {
    const [x1, y1, x2, y2] = curve(tokens.easingMove) as [number, number, number, number];
    expect(y1).toBe(0);
    expect(y2).toBe(1);
    // A plain ease-in would end at full speed: its second control point sits on the diagonal.
    expect(x2).toBeLessThan(y2);
    expect(x1).toBeGreaterThan(x2);
  });
});
