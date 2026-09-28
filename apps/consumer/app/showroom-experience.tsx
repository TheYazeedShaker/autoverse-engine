"use client";

import {
  ModelCarousel,
  ModelDock,
  SpecDrawer,
  useReducedMotion,
  type HeroModel,
} from "@autoverse/ui";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { COPY, type Lang } from "../lib/showroom/copy";
import type { DrawerContent } from "../lib/showroom/drawer";
import { createSpyHold, currentSection } from "../lib/showroom/spy";
import { RangeExplorer, type RangeExplorerProps } from "./range-explorer";
import { SpecDrawerContext } from "./spec-drawer-trigger";

// The showroom's interactive shell (spec §4, §5.3–5.5): the hero carousel, the model dock and the
// range, sharing ONE active model.
//
// - Two-way sync: the carousel, the dock and scroll-spy all set the active model; the carousel follows
//   the dock and the spy, and the dock follows the carousel and the spy.
// - The dock shows only the models the filters leave visible, in their order, and hides below 2
//   (spec §5.4, §10). It appears once the hero is scrolled past, as in the approved page.
// - A dock pick (or Show trims) scrolls to the model's section. Scroll-spy is suspended until
//   `scrollend` (with a timeout for browsers without it), so the dock doesn't flicker on the way.
//
// Everything visual stays server-rendered: the hero images and the sections are nodes from the page.

export interface DockEntry {
  id: string;
  name: string;
  slug: string;
}

export interface ShowroomExperienceProps {
  lang: Lang;
  numberingSystem: string;
  locale: string;
  hero: HeroModel[];
  dock: DockEntry[];
  backdrop?: ReactNode;
  range: Omit<RangeExplorerProps, "onVisibleChange" | "lang" | "locale" | "numberingSystem">;
  /** Per trim id: its drawer content (resolved on the server) and its side-view image element. */
  drawers: Record<string, { content: DrawerContent; image: ReactNode | null }>;
}

export function ShowroomExperience({
  lang,
  numberingSystem,
  locale,
  hero,
  dock,
  backdrop,
  range,
  drawers,
}: ShowroomExperienceProps) {
  const t = COPY[lang];
  // The spec drawer (slice 5): one at a time, for the trim whose "Technical data" was pressed. The
  // last trim stays mounted while closed, so nothing jumps as it closes.
  const [drawerTrim, setDrawerTrim] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTrigger, setDrawerTrigger] = useState<HTMLElement | null>(null);
  const drawerApi = useMemo(
    () => ({
      open: (trimId: string, trigger: HTMLElement | null) => {
        setDrawerTrigger(trigger);
        setDrawerTrim(trimId);
        setDrawerOpen(true);
      },
    }),
    [],
  );
  const drawer = drawerTrim ? drawers[drawerTrim] : undefined;
  const reduced = useReducedMotion();
  const [activeId, setActiveId] = useState(hero[0]?.id ?? "");
  const [visibleIds, setVisibleIds] = useState<string[]>(() => dock.map((d) => d.id));
  const [heroPast, setHeroPast] = useState(false);
  const heroRef = useRef<HTMLDivElement>(null);
  const spyHold = useRef<ReturnType<typeof createSpyHold> | null>(null);

  const numbers = useMemo(() => {
    const cache = new Map<number, Intl.NumberFormat>();
    return (n: number, fractionDigits: number) => {
      let f = cache.get(fractionDigits);
      if (!f) {
        f = new Intl.NumberFormat(lang === "ar" ? locale : "en", {
          numberingSystem,
          minimumFractionDigits: fractionDigits,
          maximumFractionDigits: fractionDigits,
        });
        cache.set(fractionDigits, f);
      }
      return f.format(n);
    };
  }, [lang, locale, numberingSystem]);

  // Past the hero: the dock appears.
  useEffect(() => {
    const el = heroRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => {
      if (entry) setHeroPast(!entry.isIntersecting && entry.boundingClientRect.top < 0);
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Scroll-spy over the visible sections.
  useEffect(() => {
    let frame = 0;
    const spy = () => {
      frame = 0;
      if (spyHold.current?.isHeld()) return;
      const boxes = [...document.querySelectorAll<HTMLElement>("[data-range-model]")].map((el) => {
        const r = el.getBoundingClientRect();
        return { id: el.dataset.rangeModel!, start: r.top, end: r.bottom };
      });
      const doc = document.documentElement;
      const atBottom = window.scrollY + window.innerHeight >= doc.scrollHeight - 2;
      const id = currentSection(boxes, window.innerHeight, atBottom);
      if (id) setActiveId((prev) => (prev === id ? prev : id));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(spy);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      spyHold.current?.release();
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  const scrollToModel = useCallback(
    (id: string) => {
      const el = [...document.querySelectorAll<HTMLElement>("[data-range-model]")].find(
        (s) => s.dataset.rangeModel === id,
      );
      if (!el) return;
      spyHold.current ??= createSpyHold(window);
      spyHold.current.hold();
      el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
    },
    [reduced],
  );

  const pick = (id: string) => {
    setActiveId(id);
    scrollToModel(id);
  };

  const dockModels = visibleIds
    .map((id) => dock.find((d) => d.id === id))
    .filter((d): d is DockEntry => d !== undefined)
    .map((d) => ({ id: d.id, name: d.name, href: `#${d.slug}` }));

  return (
    <>
      <div ref={heroRef}>
        <ModelCarousel
          models={hero}
          activeId={activeId}
          onActiveChange={setActiveId}
          onShowTrims={pick}
          dir={lang === "ar" ? "rtl" : "ltr"}
          formatNumber={numbers}
          backdrop={backdrop}
          className="h-[max(calc(100svh-var(--av-topbar-height)),40rem)]"
          labels={{
            region: t.modelsLabel,
            previous: t.previousModel,
            next: t.nextModel,
            trim: t.trim,
            power: t.power,
            topSpeed: t.topSpeed,
            accel: t.accel,
            unitHp: t.unitHp,
            unitKph: t.unitKph,
            unitSeconds: t.unitSeconds,
            configure: t.configure,
            showTrims: t.showTrims,
            imagePlaceholder: t.imageComingSoon,
            announce: (name, position, total) =>
              t.announceModel(name, numbers(position, 0), numbers(total, 0)),
          }}
        />
      </div>
      {dockModels.length >= 2 ? (
        <ModelDock
          models={dockModels}
          activeId={activeId}
          onPick={pick}
          label={t.modelsLabel}
          shown={heroPast}
        />
      ) : null}
      <section
        aria-labelledby="range-title"
        className="bg-surface-panel px-4 pt-20 pb-36 sm:px-[6.5vw] lg:pt-16"
      >
        <div className="mx-auto max-w-[120rem]">
          <SpecDrawerContext.Provider value={drawerApi}>
            <RangeExplorer
              {...range}
              lang={lang}
              locale={locale}
              numberingSystem={numberingSystem}
              onVisibleChange={setVisibleIds}
            />
          </SpecDrawerContext.Provider>
        </div>
      </section>
      {drawer ? (
        <SpecDrawer
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
          title={t.modelDetails}
          {...drawer.content}
          image={drawer.image}
          imagePlaceholderLabel={t.imageComingSoon}
          labels={{ close: t.close, configure: t.configure }}
          returnFocusTo={drawerTrigger}
          dir={lang === "ar" ? "rtl" : "ltr"}
        />
      ) : null}
    </>
  );
}
