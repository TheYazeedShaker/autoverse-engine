import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { axe } from "jest-axe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  INTRO_CURTAIN_SCRIPT,
  INTRO_HOLD_MAX_MS,
  INTRO_HOLD_MS,
  INTRO_STORAGE_KEY,
  IntroCurtain,
} from "./IntroCurtain";

const curtain = () => document.querySelector("[data-intro-curtain]");

beforeEach(() => {
  sessionStorage.clear();
  document.documentElement.removeAttribute("data-intro-seen");
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("IntroCurtain", () => {
  it("covers the page on a first visit: decorative, with the brand's mark", async () => {
    const { container } = render(<IntroCurtain logo={null} brandName="Demo Motors" />);
    const c = curtain()!;
    expect(c).toHaveAttribute("aria-hidden", "true");
    expect(c).toHaveTextContent("Demo Motors");
    expect(await axe(container)).toHaveNoViolations();
  });

  it("the first input lifts it, marks the session and removes it", async () => {
    render(<IntroCurtain logo={null} brandName="Demo Motors" />);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab" }));
    expect(sessionStorage.getItem(INTRO_STORAGE_KEY)).toBe("1");
    await waitFor(() => expect(curtain()).toBeNull(), { timeout: 3000 });
  });

  it("with no hero image on the page, lifts by itself once the hold ends", async () => {
    render(<IntroCurtain logo={null} brandName="Demo Motors" readySelector="#nothing" />);
    await waitFor(() => expect(sessionStorage.getItem(INTRO_STORAGE_KEY)).toBe("1"), {
      timeout: 3000,
    });
    await waitFor(() => expect(curtain()).toBeNull(), { timeout: 3000 });
  });

  it("already seen this session: never shown (the script marks <html> before it paints)", () => {
    sessionStorage.setItem(INTRO_STORAGE_KEY, "1");
    new Function(INTRO_CURTAIN_SCRIPT)();
    expect(document.documentElement).toHaveAttribute("data-intro-seen");
    render(<IntroCurtain logo={null} brandName="Demo Motors" />);
    expect(curtain()).toBeNull();
  });

  it("the script leaves a first visit alone, and survives refused storage", () => {
    new Function(INTRO_CURTAIN_SCRIPT)();
    expect(document.documentElement).not.toHaveAttribute("data-intro-seen");
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(() => new Function(INTRO_CURTAIN_SCRIPT)()).not.toThrow();
  });

  it("is hidden by CSS alone when seen or under reduced motion (no JavaScript needed)", () => {
    render(<IntroCurtain logo={null} brandName="Demo Motors" />);
    const cls = curtain()!.getAttribute("class")!;
    expect(cls).toContain("motion-reduce:hidden");
    expect(cls).toContain("[html[data-intro-seen]_&]:hidden");
  });

  it("reduced motion: never rendered", () => {
    vi.spyOn(window, "matchMedia").mockImplementation(
      (q: string) =>
        ({
          matches: q.includes("reduce"),
          media: q,
          addEventListener() {},
          removeEventListener() {},
          addListener() {},
          removeListener() {},
          onchange: null,
          dispatchEvent: () => false,
        }) as MediaQueryList,
    );
    render(<IntroCurtain logo={null} brandName="Demo Motors" />);
    expect(curtain()).toBeNull();
    expect(screen.queryByText("Demo Motors")).toBeNull();
  });
});

describe("IntroCurtain: never covers the page for good (code review)", () => {
  it("carries a CSS failsafe that hides it without JavaScript, after the failsafe delay token", () => {
    render(<IntroCurtain logo={null} brandName="Demo Motors" />);
    expect(curtain()!.getAttribute("class")).toContain("av-curtain-failsafe");
    const css = readFileSync(join(__dirname, "..", "..", "styles", "tailwind.css"), "utf8");
    expect(css).toContain("@keyframes av-curtain-failsafe");
    expect(css).toContain(
      "animation: av-curtain-failsafe var(--av-dur-fast) linear var(--av-delay-curtain-failsafe) forwards;",
    );
  });

  it("lifting keeps the curtain on screen while it rises (no instant hide), then a remount stays hidden", async () => {
    render(<IntroCurtain logo={null} brandName="Demo Motors" />);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    // The seen attribute's CSS would hide it at once and cut the lift: it must not be set now.
    expect(document.documentElement).not.toHaveAttribute("data-intro-seen");
    expect(curtain()).not.toBeNull();
    await waitFor(() => expect(curtain()).toBeNull(), { timeout: 3000 });
    render(<IntroCurtain logo={null} brandName="Demo Motors" />);
    await act(async () => {});
    expect(curtain()).toBeNull();
  });

  it("stays at least the hold time (~1.2 s from navigation start), even if the image decodes at once", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    vi.spyOn(performance, "now").mockReturnValue(0);
    const img = document.createElement("img");
    img.setAttribute("fetchpriority", "high");
    Object.defineProperty(img, "decode", { value: () => Promise.resolve() });
    document.body.appendChild(img);
    try {
      render(<IntroCurtain logo={null} brandName="Demo Motors" />);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(INTRO_HOLD_MS - 100);
      });
      expect(sessionStorage.getItem(INTRO_STORAGE_KEY)).toBeNull();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(200);
      });
      expect(sessionStorage.getItem(INTRO_STORAGE_KEY)).toBe("1");
    } finally {
      img.remove();
      vi.useRealTimers();
    }
  });

  it("an image that never decodes: waits no longer than the hold max, then lifts", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    vi.spyOn(performance, "now").mockReturnValue(0);
    const img = document.createElement("img");
    img.setAttribute("fetchpriority", "high");
    Object.defineProperty(img, "decode", { value: () => new Promise(() => {}) });
    document.body.appendChild(img);
    try {
      render(<IntroCurtain logo={null} brandName="Demo Motors" />);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(INTRO_HOLD_MAX_MS - 100);
      });
      expect(sessionStorage.getItem(INTRO_STORAGE_KEY)).toBeNull();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(200);
      });
      expect(sessionStorage.getItem(INTRO_STORAGE_KEY)).toBe("1");
    } finally {
      img.remove();
      vi.useRealTimers();
    }
  });

  it("the hold and its max are the motion tokens (owner: ~1.2 s on screen)", () => {
    expect(INTRO_HOLD_MS).toBe(1200);
    expect(INTRO_HOLD_MAX_MS).toBeGreaterThanOrEqual(INTRO_HOLD_MS);
  });

  it("storage alone (a client navigation back to the page) keeps it hidden", async () => {
    sessionStorage.setItem(INTRO_STORAGE_KEY, "1");
    render(<IntroCurtain logo={null} brandName="Demo Motors" />);
    await act(async () => {});
    expect(curtain()).toBeNull();
  });

  it("the cap counts from navigation start: late hydration lifts at once", async () => {
    vi.spyOn(performance, "now").mockReturnValue(5000);
    render(<IntroCurtain logo={null} brandName="Demo Motors" readySelector="#nothing" />);
    await waitFor(() => expect(sessionStorage.getItem(INTRO_STORAGE_KEY)).toBe("1"), {
      timeout: 200,
    });
  });
});
