import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { axe } from "jest-axe";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CarEntrance } from "./CarEntrance";
import { Reveal } from "./Reveal";
import { StatCount } from "./StatCount";

// A controllable IntersectionObserver, and a switch for "this element starts below the fold".
let observers: { cb: IntersectionObserverCallback; el: Element }[] = [];
class FakeIO {
  constructor(private cb: IntersectionObserverCallback) {}
  observe(el: Element) {
    observers.push({ cb: this.cb, el });
  }
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}
const seeAll = () =>
  act(() => {
    for (const o of observers) {
      o.cb([{ isIntersecting: true, target: o.el } as IntersectionObserverEntry], {} as never);
    }
  });

function belowTheFold(below: boolean) {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
    top: below ? 5000 : 10,
  } as DOMRect);
}

function reducedMotion(on: boolean) {
  vi.spyOn(window, "matchMedia").mockImplementation(
    (q: string) =>
      ({
        matches: on && q.includes("reduce"),
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

beforeEach(() => {
  observers = [];
  vi.stubGlobal("IntersectionObserver", FakeIO);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const opacity = (el: Element) => (el as HTMLElement).style.opacity;

describe("Reveal", () => {
  it("in view at load: shown at once, never hidden", async () => {
    belowTheFold(false);
    render(<Reveal>Header</Reveal>);
    const el = screen.getByText("Header");
    await act(async () => {});
    expect(opacity(el)).not.toBe("0");
    expect(observers).toHaveLength(0);
  });

  it("below the fold: hidden after hydration, then fades in when seen", async () => {
    belowTheFold(true);
    render(<Reveal level={1}>Card</Reveal>);
    const el = screen.getByText("Card");
    await waitFor(() => expect(opacity(el)).toBe("0"));
    seeAll();
    await waitFor(() => expect(opacity(el)).toBe("1"), { timeout: 3000 });
    expect(el).toHaveAttribute("data-reveal", "1");
  });

  it("reduced motion: never hidden, even below the fold", async () => {
    belowTheFold(true);
    reducedMotion(true);
    render(<Reveal>Card</Reveal>);
    await act(async () => {});
    expect(opacity(screen.getByText("Card"))).not.toBe("0");
    expect(observers).toHaveLength(0);
  });

  it("server-rendered: visible, never hidden (nothing is invisible without JavaScript)", () => {
    const html = renderToString(
      <Reveal level={1}>
        <p>Card</p>
      </Reveal>,
    );
    expect(html).toContain("Card");
    expect(html).not.toMatch(/opacity: ?0[;"]/);
  });

  it("has no axe violations", async () => {
    belowTheFold(false);
    const { container } = render(
      <Reveal>
        <h2>Header</h2>
      </Reveal>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("CarEntrance", () => {
  it("below the fold: waits out of place and invisible, then drives in when seen", async () => {
    belowTheFold(true);
    const { container } = render(
      <CarEntrance>
        <img alt="Demo SUV, side view" src="/car.png" />
      </CarEntrance>,
    );
    const el = container.querySelector("[data-car-entrance]") as HTMLElement;
    await waitFor(() => expect(el.style.opacity).toBe("0"));
    expect(el.style.transform).toContain("translateX(-2.5rem)");
    seeAll();
    await waitFor(() => expect(el.style.opacity).toBe("1"), { timeout: 4000 });
  });

  it("reduced motion: the car is simply there", async () => {
    belowTheFold(true);
    reducedMotion(true);
    const { container } = render(
      <CarEntrance>
        <img alt="Demo SUV, side view" src="/car.png" />
      </CarEntrance>,
    );
    await act(async () => {});
    const el = container.querySelector("[data-car-entrance]") as HTMLElement;
    expect(el.style.opacity).not.toBe("0");
    expect(el.style.transform ?? "").not.toContain("2.5rem");
  });
});

describe("StatCount", () => {
  const props = {
    final: "420",
    to: 420,
    fractionDigits: 0,
    locale: "en-EG",
    numberingSystem: "latn",
  };

  it("assistive tech reads the final value; the counting text is hidden from it", () => {
    belowTheFold(false);
    const { container } = render(<StatCount {...props} />);
    expect(container.querySelector("[data-stat-count]")).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelector(".sr-only")).toHaveTextContent("420");
  });

  it("below the fold: shows zero until seen, then counts up to the final value", async () => {
    belowTheFold(true);
    const { container } = render(<StatCount {...props} />);
    const shown = container.querySelector("[data-stat-count]")!;
    await waitFor(() => expect(shown).toHaveTextContent("0"));
    seeAll();
    await waitFor(() => expect(shown).toHaveTextContent("420"), { timeout: 4000 });
  });

  it("counts in the page's digits (Arabic-Indic for AR)", async () => {
    belowTheFold(true);
    const { container } = render(
      <StatCount final="٦٫٤" to={6.4} fractionDigits={1} locale="ar-EG" numberingSystem="arab" />,
    );
    const shown = container.querySelector("[data-stat-count]")!;
    await waitFor(() => expect(shown).toHaveTextContent("٠٫٠"));
  });

  it("in view at load, or reduced motion: the final value, no count", async () => {
    belowTheFold(true);
    reducedMotion(true);
    const { container } = render(<StatCount {...props} />);
    await act(async () => {});
    expect(container.querySelector("[data-stat-count]")).toHaveTextContent("420");
  });
});

describe("server rendering (code review)", () => {
  it("CarEntrance renders the car in place: no offset, no hiding", () => {
    const html = renderToString(
      <CarEntrance className="absolute">
        <img alt="Demo SUV, side view" src="/car.png" />
      </CarEntrance>,
    );
    expect(html).toContain("Demo SUV, side view");
    expect(html).not.toMatch(/opacity: ?0[;"]/);
    expect(html).not.toContain("2.5rem");
  });

  it("StatCount renders the final value on the server, in tabular digits", () => {
    const html = renderToString(
      <StatCount final="420" to={420} fractionDigits={0} locale="en-EG" numberingSystem="latn" />,
    );
    expect(html).toMatch(/data-stat-count[^>]*>420</);
    expect(html).toContain("tabular-nums");
  });
});
