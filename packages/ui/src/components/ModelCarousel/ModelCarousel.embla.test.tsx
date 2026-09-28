import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HERO_MODELS, LABELS_EN, formatEn } from "./fixtures";
import { ModelCarousel } from "./ModelCarousel";

// embla-carousel-react re-initialises the carousel whenever the options it is given differ from the
// last render's. A model change must not do that (it would cut a smooth scroll short and break a drag
// in progress), so the options object must stay the same across active-model changes.

const seen = vi.hoisted(() => [] as unknown[]);
vi.mock("embla-carousel-react", async (importOriginal) => {
  const real = await importOriginal<typeof import("embla-carousel-react")>();
  return {
    ...real,
    default: (options: unknown, plugins?: unknown) => {
      seen.push(options);
      return (real.default as (o: unknown, p?: unknown) => unknown)(options, plugins);
    },
  };
});

afterEach(cleanup);

describe("ModelCarousel ↔ Embla", () => {
  it("keeps the same options object when the active model changes (no reInit)", () => {
    const props = {
      models: HERO_MODELS,
      onActiveChange: () => {},
      onShowTrims: () => {},
      dir: "ltr" as const,
      labels: LABELS_EN,
      formatNumber: formatEn,
    };
    const { rerender } = render(<ModelCarousel {...props} activeId="aurora" />);
    const first = seen[seen.length - 1];
    rerender(<ModelCarousel {...props} activeId="vela" />);
    rerender(<ModelCarousel {...props} activeId="nimbus" />);
    expect(seen.length).toBeGreaterThanOrEqual(3);
    expect(seen.slice(seen.indexOf(first)).every((o) => o === first)).toBe(true);
    expect(first).toMatchObject({ startIndex: 0 });
  });
});
