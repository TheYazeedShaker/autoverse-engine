import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CountUp } from "./CountUp";
import { HERO_MODELS, LABELS_AR, LABELS_EN, formatAr, formatEn } from "./fixtures";
import { ModelCarousel, type HeroModel, type HeroState } from "./ModelCarousel";

afterEach(cleanup);

function Hero({
  models = HERO_MODELS,
  dir = "ltr",
  onStateChange,
  onShowTrims = () => {},
}: {
  models?: HeroModel[];
  dir?: "ltr" | "rtl";
  onStateChange?: (s: HeroState) => void;
  onShowTrims?: (id: string) => void;
}) {
  const [active, setActive] = useState(models[0]!.id);
  return (
    <ModelCarousel
      models={models}
      activeId={active}
      onActiveChange={setActive}
      onStateChange={onStateChange}
      onShowTrims={onShowTrims}
      dir={dir}
      labels={dir === "rtl" ? LABELS_AR : LABELS_EN}
      formatNumber={dir === "rtl" ? formatAr : formatEn}
    />
  );
}

const region = () => screen.getByRole("region");
const current = () =>
  within(region())
    .getAllByRole("button")
    .find((b) => b.getAttribute("aria-current") === "true");
const stats = () => [...document.querySelectorAll("dd .sr-only")].map((e) => e.textContent);

describe("ModelCarousel", () => {
  it("is a named carousel with a slide per model, the first active", () => {
    render(<Hero />);
    expect(region()).toHaveAttribute("aria-roledescription", "carousel");
    const slides = document.querySelectorAll('[aria-roledescription="slide"]');
    expect(slides).toHaveLength(3);
    expect(current()).toHaveTextContent("Aurora GT");
    // Nothing is announced on load: the live region speaks only for moves made in the carousel.
    expect(document.querySelector('[aria-live="polite"]')!.textContent).toBe("");
    // Only the active slide is exposed; the neighbours are aria-hidden.
    expect([...slides].map((s) => s.getAttribute("aria-hidden"))).toEqual([null, "true", "true"]);
  });

  it("shows the active trim's key stats; the trim pill switches them and enters `trims`", async () => {
    const onStateChange = vi.fn();
    render(<Hero onStateChange={onStateChange} />);
    expect(stats()).toEqual(["420", "180", "6.4"]);
    await userEvent.click(screen.getByRole("radio", { name: "Performance" }));
    expect(stats()).toEqual(["500", "210", "4.9"]);
    expect(region()).toHaveAttribute("data-hero-state", "trims");
    expect(onStateChange).toHaveBeenLastCalledWith("trims");
  });

  it("shows no trim pill for a model with one trim", async () => {
    render(<Hero models={[HERO_MODELS[1]!, HERO_MODELS[2]!]} />);
    expect(screen.queryByRole("radiogroup")).toBeNull();
  });

  it("Escape steps back: trims → focus → browse", async () => {
    render(<Hero />);
    await userEvent.click(screen.getByRole("radio", { name: "Performance" }));
    expect(region()).toHaveAttribute("data-hero-state", "trims");
    fireEvent.keyDown(region(), { key: "Escape" });
    expect(region()).toHaveAttribute("data-hero-state", "focus");
    fireEvent.keyDown(region(), { key: "Escape" });
    expect(region()).toHaveAttribute("data-hero-state", "browse");
  });

  it("picking a name or an arrow enters `focus`", async () => {
    render(<Hero />);
    await userEvent.click(screen.getByRole("button", { name: "Next model" }));
    expect(region()).toHaveAttribute("data-hero-state", "focus");
  });

  it("Show trims hands the active model to the app and enters `trims`", async () => {
    const onShowTrims = vi.fn();
    render(<Hero onShowTrims={onShowTrims} />);
    await userEvent.click(screen.getByRole("button", { name: "Show trims" }));
    expect(onShowTrims).toHaveBeenCalledWith("aurora");
    expect(region()).toHaveAttribute("data-hero-state", "trims");
  });

  it("follows the app's active model (the dock and scroll-spy drive it)", () => {
    const { rerender } = render(
      <ModelCarousel
        models={HERO_MODELS}
        activeId="aurora"
        onActiveChange={() => {}}
        onShowTrims={() => {}}
        dir="ltr"
        labels={LABELS_EN}
        formatNumber={formatEn}
      />,
    );
    rerender(
      <ModelCarousel
        models={HERO_MODELS}
        activeId="nimbus"
        onActiveChange={() => {}}
        onShowTrims={() => {}}
        dir="ltr"
        labels={LABELS_EN}
        formatNumber={formatEn}
      />,
    );
    expect(current()).toHaveTextContent("Nimbus");
    expect(stats()).toEqual(["250", "170", "8.1"]);
  });

  it("arrow keys move in the reading direction (RTL: left is next)", async () => {
    render(<Hero />);
    fireEvent.keyDown(region(), { key: "ArrowRight" });
    await waitFor(() => expect(current()).toHaveTextContent("Vela"));
    fireEvent.keyDown(region(), { key: "ArrowLeft" });
    await waitFor(() => expect(current()).toHaveTextContent("Aurora GT"));
    cleanup();
    render(<Hero dir="rtl" />);
    fireEvent.keyDown(screen.getByRole("region"), { key: "ArrowLeft" });
    await waitFor(() => expect(current()).toHaveTextContent("Vela"));
  });

  it("arrow keys work with nothing focused while the hero fills the screen, and not otherwise", async () => {
    render(<Hero />);
    const box = (top: number, bottom: number) =>
      vi.spyOn(region(), "getBoundingClientRect").mockReturnValue({ top, bottom } as DOMRect);
    (document.activeElement as HTMLElement | null)?.blur();
    box(0, window.innerHeight);
    fireEvent.keyDown(window, { key: "ArrowRight" });
    await waitFor(() => expect(current()).toHaveTextContent("Vela"));
    // Scrolled away: the range owns the keys.
    box(-2000, -1000);
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(current()).toHaveTextContent("Vela");
    // A focused control (e.g. the search field) keeps its keys.
    box(0, window.innerHeight);
    const input = document.createElement("input");
    document.body.append(input);
    input.focus();
    fireEvent.keyDown(input, { key: "ArrowRight" });
    expect(current()).toHaveTextContent("Vela");
    input.remove();
  });

  it("arrow keys inside the trim pill switch trims, not models", async () => {
    render(<Hero />);
    screen.getByRole("radio", { name: "Long Range" }).focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("radio", { name: "Performance" })).toHaveFocus();
    expect(current()).toHaveTextContent("Aurora GT");
  });

  it("announces only moves made in the carousel, not the app's (scroll-spy) updates", async () => {
    const props = {
      models: HERO_MODELS,
      onActiveChange: () => {},
      onShowTrims: () => {},
      dir: "ltr" as const,
      labels: LABELS_EN,
      formatNumber: formatEn,
    };
    const { rerender } = render(<ModelCarousel {...props} activeId="aurora" />);
    const live = () => document.querySelector('[aria-live="polite"]')!.textContent;
    expect(live()).toBe("");
    rerender(<ModelCarousel {...props} activeId="nimbus" />);
    expect(live()).toBe("");
    cleanup();
    render(<Hero />);
    await userEvent.click(screen.getByRole("button", { name: "Next model" }));
    await waitFor(() =>
      expect(document.querySelector('[aria-live="polite"]')!.textContent).toBe("Vela, 2 of 3"),
    );
  });

  it("Configure stays disabled until the configurator exists", () => {
    render(<Hero />);
    expect(screen.getByRole("button", { name: "Configure" })).toBeDisabled();
  });

  it("sparse rule: one model is a static hero (no arrows, no name row)", () => {
    render(<Hero models={[HERO_MODELS[1]!]} />);
    expect(screen.queryByRole("button", { name: "Next model" })).toBeNull();
    expect(screen.queryByRole("list")).toBeNull();
    expect(screen.getByRole("heading", { name: "Vela" })).toBeInTheDocument();
  });

  it("uses the reading direction: chevrons flip in RTL; stats use the page's digits", () => {
    render(<Hero dir="rtl" />);
    expect(screen.getByRole("region", { name: "الطرازات" })).toBeInTheDocument();
    expect(stats()).toEqual(["٤٢٠", "١٨٠", "٦٫٤"]);
  });

  it("the model names scroll with no scrollbar (its thumb drew a line under the names on phones)", () => {
    render(<Hero />);
    const names = within(region()).getAllByRole("list")[0]!;
    expect(names).toHaveClass("overflow-x-auto", "[scrollbar-width:none]");
    expect(names).toHaveClass("[&::-webkit-scrollbar]:hidden");
  });

  describe("keeps the active name centred in an overflowing names row (the row only)", () => {
    // Test geometry (CSS px in a fake layout, not styling): a 300-wide row showing 600 of names,
    // the second name at 200–280.
    const ROW = 300;
    const NAMES = 600;
    const NAME_LEFT = 200;
    const NAME_WIDTH = 80;
    const NAME_HEIGHT = 20;
    const rect = (left: number, width: number) =>
      ({
        left,
        width,
        right: left + width,
        top: 0,
        bottom: NAME_HEIGHT,
        height: NAME_HEIGHT,
        x: left,
        y: 0,
      }) as DOMRect;
    const layOut = (overflow: boolean) => {
      const row = within(region()).getAllByRole("list")[0]!;
      Object.defineProperty(row, "scrollWidth", {
        configurable: true,
        value: overflow ? NAMES : ROW,
      });
      Object.defineProperty(row, "clientWidth", { configurable: true, value: ROW });
      row.getBoundingClientRect = () => rect(0, ROW);
      (row.children[1] as HTMLElement).getBoundingClientRect = () => rect(NAME_LEFT, NAME_WIDTH);
      const scrollBy = vi.fn();
      row.scrollBy = scrollBy as unknown as typeof row.scrollBy;
      return scrollBy;
    };

    it.each(["ltr", "rtl"] as const)(
      "%s: moves the row by the physical centre offset, instantly, never the page",
      async (dir) => {
        const pageScroll = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
        const intoView = vi.fn();
        const saved = Element.prototype.scrollIntoView;
        Element.prototype.scrollIntoView = intoView;
        render(<Hero dir={dir} />);
        const scrollBy = layOut(true);
        await userEvent.click(
          screen.getByRole("button", { name: dir === "rtl" ? LABELS_AR.next : "Next model" }),
        );
        // The second name's centre minus the row's centre (240 − 150).
        const offset = NAME_LEFT + NAME_WIDTH / 2 - ROW / 2;
        expect(scrollBy).toHaveBeenLastCalledWith({ left: offset, behavior: "auto" });
        expect(pageScroll).not.toHaveBeenCalled();
        expect(intoView).not.toHaveBeenCalled();
        Element.prototype.scrollIntoView = saved;
        pageScroll.mockRestore();
      },
    );

    it("does nothing when the names fit", async () => {
      render(<Hero />);
      const scrollBy = layOut(false);
      await userEvent.click(screen.getByRole("button", { name: "Next model" }));
      expect(current()).toHaveTextContent(HERO_MODELS[1]!.name);
      expect(scrollBy).not.toHaveBeenCalled();
    });
  });

  it("every car sits in the same 16:9 frame (placeholder included)", () => {
    render(<Hero />);
    const frames = document.querySelectorAll('[data-car-frame="front-34"]');
    expect(frames.length).toBe(4); // 2 trims + 1 + 1
    frames.forEach((f) => expect(f).toHaveClass("aspect-video"));
  });

  it("has no axe violations, in both directions", async () => {
    const { container } = render(<Hero />);
    expect(await axe(container)).toHaveNoViolations();
    cleanup();
    const rtl = render(
      <div dir="rtl" lang="ar">
        <Hero dir="rtl" />
      </div>,
    ).container;
    expect(await axe(rtl)).toHaveNoViolations();
  });
});

describe("CountUp", () => {
  it("renders the value (and an em dash for none), with a screen-reader twin", () => {
    render(
      <>
        <CountUp value={420} format={(n) => String(Math.round(n))} />
        <CountUp value={null} format={String} />
      </>,
    );
    expect(screen.getAllByText("420")).toHaveLength(2);
    expect(document.querySelector("[data-count-up]")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getAllByText("—")).toHaveLength(2);
  });

  it("tweens from the previous value to the new one and lands exactly on it", async () => {
    const format = (n: number) => String(Math.round(n));
    const { rerender } = render(<CountUp value={100} format={format} />);
    rerender(<CountUp value={200} format={format} />);
    const el = document.querySelector("[data-count-up]")!;
    expect(el.textContent).toBe("100"); // starts from the previous value, not the new one
    // The screen-reader twin holds the final value from the start.
    expect(document.querySelector(".sr-only")!.textContent).toBe("200");
    await waitFor(() => expect(el.textContent).toBe("200"), { timeout: 3000 });
  });

  it("an interrupted tween restarts from where it stopped, not from the old target", async () => {
    const format = (n: number) => String(Math.round(n));
    const { rerender } = render(<CountUp value={0} format={format} />);
    rerender(<CountUp value={1000} format={format} />);
    const el = document.querySelector("[data-count-up]")!;
    await waitFor(() => expect(Number(el.textContent)).toBeGreaterThan(0), { timeout: 3000 });
    const midway = Number(el.textContent);
    rerender(<CountUp value={10} format={format} />);
    // Starts from the intermediate value (not 0 and not 1000), then lands on the new target.
    expect(Number(el.textContent)).toBeGreaterThanOrEqual(midway);
    expect(Number(el.textContent)).toBeLessThan(1000);
    await waitFor(() => expect(el.textContent).toBe("10"), { timeout: 3000 });
  });

  it("follows a new format for the same value (EN ↔ AR digits)", () => {
    const { rerender } = render(<CountUp value={420} format={(n) => String(n)} />);
    rerender(
      <CountUp
        value={420}
        format={(n) => new Intl.NumberFormat("ar-EG", { numberingSystem: "arab" }).format(n)}
      />,
    );
    expect(document.querySelector("[data-count-up]")!.textContent).toBe("٤٢٠");
  });
});

describe("ModelCarousel: Book a test drive (slice 7)", () => {
  it("is a ghost button after Show trims that hands the active model and itself to the app", async () => {
    const onClick = vi.fn();
    render(
      <ModelCarousel
        models={HERO_MODELS}
        activeId={HERO_MODELS[0]!.id}
        onActiveChange={() => {}}
        onShowTrims={() => {}}
        dir="ltr"
        labels={LABELS_EN}
        formatNumber={formatEn}
        bookTestDrive={{ label: "Book a test drive", onClick }}
      />,
    );
    const button = screen.getByRole("button", { name: "Book a test drive" });
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledWith(HERO_MODELS[0]!.id, button);
  });

  it("is absent without the prop", () => {
    render(<Hero />);
    expect(screen.queryByRole("button", { name: "Book a test drive" })).toBeNull();
  });
});

describe("ModelCarousel: one layout for every model (slice 8 review)", () => {
  it("the trim pill floats over the model area, so models with and without trims lay out alike", () => {
    render(<Hero />);
    const pill = screen.getByRole("radiogroup");
    const area = document.querySelector("[data-carousel-viewport]")!.parentElement!;
    expect(area.contains(pill)).toBe(true);
    expect(pill.closest(".absolute")).not.toBeNull();
  });
});
