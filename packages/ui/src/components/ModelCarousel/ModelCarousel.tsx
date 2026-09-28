"use client";

import useEmblaCarousel from "embla-carousel-react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { cn } from "../../cn";
import { semanticMotion, safeTransition } from "../../motion";
import { Button } from "../Button";
import { CarImageFrame } from "../CarImageFrame";
import { Icon } from "../Icon";
import { SegmentedToggle } from "../SegmentedToggle";
import { CountUp } from "./CountUp";

// ModelCarousel — the showroom hero (spec §5.3), rebuilt from the approved page:
//
// - A row of model names (the active one larger), and a trim pill when the active model has several
//   trims (it swaps the hero image to that trim's, with a crossfade).
// - One Embla track (never hand-rolled): 1:1 drag, one model per flick, loop, a ~4% neighbour peek on
//   desktop (slide = 92% of the stage), full width on mobile, mirrored in RTL.
// - Prev/next buttons, arrow keys on the carousel (reading direction aware), Escape steps back.
// - Three key stats that count up from the previous model's values (the `countUp` semantic motion).
// - Configure and Show trims.
// - A polite live region announces the active model.
//
// Hero states (spec §5.3, ADR 0023): browse (the start) → focus (the visitor picked a model: a name,
// an arrow, a key, a drag that settled, or the dock) → trims (a trim pill pick or Show trims). Escape
// steps back trims → focus → browse. They change nothing visually, as in the approved page; they are
// reported through onStateChange for the journey events (slice 9).
//
// Controlled: the app owns the active model (shared with the dock and scroll-spy). The car images are
// the app's elements (next/image with its loading priority); the frame gives every car the same box.
//
// Sparse rule (§8): one model → a static hero: no drag, no arrows, no name row.

export interface HeroTrim {
  id: string;
  label: string;
  /** The front three-quarter image element, or null for the placeholder. */
  image: ReactNode | null;
  stats: { powerHp: number | null; topSpeedKph: number | null; accelS: number | null };
}

export interface HeroModel {
  id: string;
  name: string;
  trims: HeroTrim[];
}

export type HeroState = "browse" | "focus" | "trims";

export interface ModelCarouselProps {
  models: HeroModel[];
  activeId: string;
  /** The visitor (or Embla) changed the active model. */
  onActiveChange: (id: string) => void;
  onStateChange?: (state: HeroState) => void;
  /** "Show trims": the app scrolls to the model's section. */
  onShowTrims: (id: string) => void;
  dir: "ltr" | "rtl";
  labels: {
    /** Carousel name, e.g. "Models". */
    region: string;
    previous: string;
    next: string;
    /** The trim pill's name, e.g. "Trim". */
    trim: string;
    power: string;
    topSpeed: string;
    accel: string;
    unitHp: string;
    unitKph: string;
    unitSeconds: string;
    configure: string;
    showTrims: string;
    imagePlaceholder: string;
    /** Live-region text for the active model, e.g. "Aurora GT, 2 of 5". */
    announce: (name: string, position: number, total: number) => string;
  };
  /** Formats a stat for display (the page's digits). */
  formatNumber: (n: number, fractionDigits: number) => string;
  /** Behind the hero content: the backdrop (brand-invariant). */
  backdrop?: ReactNode;
  className?: string;
}

export function ModelCarousel({
  models,
  activeId,
  onActiveChange,
  onStateChange,
  onShowTrims,
  dir,
  labels,
  formatNumber,
  backdrop,
  className,
}: ModelCarouselProps) {
  const reduced = useReducedMotion();
  const sparse = models.length < 2;
  const activeIndex = Math.max(
    0,
    models.findIndex((m) => m.id === activeId),
  );
  // The start index is read ONCE: embla-carousel-react re-initialises whenever its options change, so
  // a live startIndex would reInit on every model change and cut the scroll short.
  const [startIndex] = useState(activeIndex);
  const options = useMemo(
    () => ({
      loop: !sparse,
      direction: dir,
      align: "center" as const,
      // Centre every slide, the first and last too (when there are too few models to loop, Embla
      // would otherwise pin the first one to the edge).
      containScroll: false as const,
      startIndex,
      watchDrag: !sparse,
      duration: reduced
        ? semanticMotion.carouselSettle.reducedDuration
        : semanticMotion.carouselSettle.duration,
    }),
    [sparse, dir, startIndex, reduced],
  );
  const [viewportRef, api] = useEmblaCarousel(options);
  const [trimOf, setTrimOf] = useState<Record<string, string>>({});
  const [state, setStateRaw] = useState<HeroState>("browse");
  // The current state in a ref, so a change is reported exactly once, from the event that caused it
  // (never from inside a state updater, which React may run twice).
  const stateRef = useRef<HeroState>("browse");
  const onStateChangeRef = useRef(onStateChange);
  onStateChangeRef.current = onStateChange;
  const setState = useCallback((next: HeroState) => {
    if (stateRef.current === next) return;
    stateRef.current = next;
    setStateRaw(next);
    onStateChangeRef.current?.(next);
  }, []);
  // The live region speaks only for moves the visitor made in the carousel, never for scroll-spy
  // updates while they read the range below.
  const userMove = useRef(false);
  const [announced, setAnnounced] = useState<number | null>(null);

  // Embla → app: a settled selection (drag, arrows, keys) becomes the active model.
  const onActiveChangeRef = useRef(onActiveChange);
  onActiveChangeRef.current = onActiveChange;
  const modelsRef = useRef(models);
  modelsRef.current = models;
  const draggedRef = useRef(false);
  useEffect(() => {
    if (!api) return;
    const onSelect = () => {
      const index = api.selectedScrollSnap();
      const m = modelsRef.current[index];
      if (m) onActiveChangeRef.current(m.id);
      if (userMove.current) setAnnounced(index);
      userMove.current = false;
    };
    const onPointerDown = () => {
      draggedRef.current = true;
      userMove.current = true;
    };
    const onSettle = () => {
      if (draggedRef.current) setState("focus");
      draggedRef.current = false;
    };
    api.on("select", onSelect);
    api.on("pointerDown", onPointerDown);
    api.on("settle", onSettle);
    return () => {
      api.off("select", onSelect);
      api.off("pointerDown", onPointerDown);
      api.off("settle", onSettle);
    };
  }, [api, setState]);

  // App → Embla: the dock or scroll-spy moved the active model.
  useEffect(() => {
    if (!api || api.selectedScrollSnap() === activeIndex) return;
    api.scrollTo(activeIndex, Boolean(reduced));
  }, [api, activeIndex, reduced]);

  const go = (index: number) => {
    setState("focus");
    userMove.current = true;
    api?.scrollTo(index, Boolean(reduced));
  };
  const step = (delta: 1 | -1) => {
    setState("focus");
    userMove.current = true;
    if (delta === 1) api?.scrollNext(Boolean(reduced));
    else api?.scrollPrev(Boolean(reduced));
  };

  /** Handles a key for the carousel; true when it was used. */
  const handleKey = (key: string): boolean => {
    if (key === "Escape") {
      if (state === "trims") setState("focus");
      else if (state === "focus") setState("browse");
      return state !== "browse";
    }
    if (sparse || (key !== "ArrowLeft" && key !== "ArrowRight")) return false;
    // Arrow keys follow the reading direction: in RTL the next model is to the left.
    step((key === "ArrowRight") === (dir === "ltr") ? 1 : -1);
    return true;
  };
  const onKeyDown = (e: KeyboardEvent) => {
    // Keys a control inside the hero already handled (the trim pill's roving arrows) stay its own.
    if (e.defaultPrevented || (e.target as Element).closest?.("[role=radiogroup]")) return;
    if (handleKey(e.key) && e.key !== "Escape") e.preventDefault();
  };

  // Arrow keys also work when nothing is focused (the visitor clicked the car, or just arrived) and
  // the hero fills the middle of the screen. Keys aimed at any focused control stay that control's.
  // Assumes one hero per page (each mounted carousel listens; only one can span the middle).
  const sectionRef = useRef<HTMLElement>(null);
  const handleKeyRef = useRef(handleKey);
  handleKeyRef.current = handleKey;
  useEffect(() => {
    const onWindowKey = (e: globalThis.KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      const focused = document.activeElement;
      if (focused && focused !== document.body) return;
      const box = sectionRef.current?.getBoundingClientRect();
      const middle = window.innerHeight / 2;
      if (!box || box.top > middle || box.bottom < middle) return;
      if (handleKeyRef.current(e.key)) e.preventDefault();
    };
    window.addEventListener("keydown", onWindowKey);
    return () => window.removeEventListener("keydown", onWindowKey);
  }, []);

  const active = models[activeIndex]!;
  const trimId = trimOf[active.id] ?? active.trims[0]?.id;
  const trim = active.trims.find((t) => t.id === trimId) ?? active.trims[0];
  const PrevIcon = dir === "rtl" ? ChevronRight : ChevronLeft;
  const NextIcon = dir === "rtl" ? ChevronLeft : ChevronRight;
  const int = (n: number) => formatNumber(n, 0);
  const oneDecimal = (n: number) => formatNumber(n, 1);

  return (
    <section
      ref={sectionRef}
      aria-roledescription="carousel"
      aria-label={labels.region}
      onKeyDown={onKeyDown}
      data-hero-state={state}
      className={cn(
        // The stage re-publishes the contextual pair for the dark surface, so inverting controls
        // (SegmentedToggle, Button) are AA on it.
        "bg-surface-dark text-on-dark relative isolate flex min-h-[40rem] flex-col overflow-hidden [--av-bg:var(--av-surface-dark)] [--av-fg-muted:var(--av-on-dark-muted)] [--av-fg:var(--av-on-dark)]",
        className,
      )}
    >
      {backdrop ? (
        <div aria-hidden="true" className="absolute inset-0 -z-10">
          {backdrop}
        </div>
      ) : null}
      {/* Top and bottom shade, so the names and stats read on any backdrop. */}
      <div
        aria-hidden="true"
        className="from-surface-dark/60 to-surface-dark/60 pointer-events-none absolute inset-0 -z-10 bg-linear-to-b via-transparent"
      />

      <p aria-live="polite" className="sr-only">
        {announced === null || !models[announced]
          ? ""
          : labels.announce(models[announced]!.name, announced + 1, models.length)}
      </p>

      <div className="flex flex-col items-center gap-3 px-4 pt-5 lg:gap-4 lg:pt-7">
        {sparse ? null : (
          <ul
            role="list"
            className="flex max-w-full items-baseline gap-4 overflow-x-auto px-3 lg:gap-10"
          >
            {models.map((m, i) => {
              const on = i === activeIndex;
              return (
                <li key={m.id}>
                  <button
                    type="button"
                    aria-current={on ? "true" : undefined}
                    onClick={() => go(i)}
                    className={cn(
                      "focus-visible:ring-focus-ring rounded-sm p-0.5 whitespace-nowrap transition-colors duration-(--av-dur) ease-(--av-ease) focus-visible:outline-none focus-visible:ring-2 motion-reduce:transition-none",
                      on
                        ? "text-on-dark text-xl font-semibold lg:text-3xl"
                        : "text-on-dark-muted hover:text-on-dark text-sm lg:text-xl",
                    )}
                  >
                    {m.name}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {sparse ? (
          <h2 className="text-on-dark text-xl font-semibold lg:text-3xl">{active.name}</h2>
        ) : null}
        {active.trims.length > 1 ? (
          <SegmentedToggle
            label={labels.trim}
            dir={dir}
            size="sm"
            value={trim?.id}
            onValueChange={(v) => {
              setTrimOf((s) => ({ ...s, [active.id]: v }));
              setState("trims");
            }}
            options={active.trims.map((t) => ({ value: t.id, label: t.label }))}
            className="bg-surface-dark/40 rounded-full backdrop-blur-md [&>*]:rounded-full"
          />
        ) : null}
      </div>

      <div className="relative min-h-0 flex-1">
        <div ref={viewportRef} className="h-full overflow-hidden" data-carousel-viewport>
          <div className="flex h-full touch-pan-y">
            {models.map((m, i) => {
              const on = i === activeIndex;
              const selected = trimOf[m.id] ?? m.trims[0]?.id;
              return (
                <div
                  key={m.id}
                  role="group"
                  aria-roledescription="slide"
                  aria-label={m.name}
                  aria-hidden={on ? undefined : true}
                  className="flex h-full [container-type:size] min-w-0 shrink-0 grow-0 basis-full items-center justify-center md:basis-(--av-hero-slide)"
                >
                  <div
                    className={cn(
                      "relative w-[min(100cqw,calc(100cqh*16/9))] transition-opacity duration-(--av-dur-slow) ease-(--av-ease) motion-reduce:transition-none",
                      on ? "opacity-100" : "opacity-40",
                    )}
                  >
                    {m.trims.map((t, ti) => {
                      const shown = t.id === selected;
                      return (
                        <motion.div
                          key={t.id}
                          initial={false}
                          animate={{ opacity: shown ? 1 : 0 }}
                          transition={safeTransition(semanticMotion.crossfade, reduced)}
                          className={cn(ti > 0 && "absolute inset-0")}
                          aria-hidden={shown ? undefined : true}
                        >
                          <CarImageFrame
                            view="front-34"
                            image={t.image}
                            placeholderLabel={labels.imagePlaceholder}
                          />
                        </motion.div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        {sparse ? null : (
          <>
            <button
              type="button"
              aria-label={labels.previous}
              onClick={() => step(-1)}
              className="border-on-dark/25 bg-surface-dark/35 text-on-dark hover:border-on-dark/60 focus-visible:ring-focus-ring absolute start-3 top-1/2 z-10 grid size-11 -translate-y-1/2 place-items-center rounded-full border backdrop-blur-md focus-visible:outline-none focus-visible:ring-2 lg:start-10"
            >
              <Icon icon={PrevIcon} size="md" />
            </button>
            <button
              type="button"
              aria-label={labels.next}
              onClick={() => step(1)}
              className="border-on-dark/25 bg-surface-dark/35 text-on-dark hover:border-on-dark/60 focus-visible:ring-focus-ring absolute end-3 top-1/2 z-10 grid size-11 -translate-y-1/2 place-items-center rounded-full border backdrop-blur-md focus-visible:outline-none focus-visible:ring-2 lg:end-10"
            >
              <Icon icon={NextIcon} size="md" />
            </button>
          </>
        )}
      </div>

      <div className="flex flex-col items-center gap-4 px-4 pb-6 lg:gap-7 lg:pb-12">
        <dl className="flex items-start gap-8 lg:gap-16">
          <Stat label={labels.power} unit={labels.unitHp}>
            <CountUp value={trim?.stats.powerHp ?? null} format={int} />
          </Stat>
          <Stat label={labels.topSpeed} unit={labels.unitKph}>
            <CountUp value={trim?.stats.topSpeedKph ?? null} format={int} />
          </Stat>
          <Stat label={labels.accel} unit={labels.unitSeconds}>
            <CountUp value={trim?.stats.accelS ?? null} format={oneDecimal} />
          </Stat>
        </dl>
        <div className="flex flex-wrap justify-center gap-3">
          {/* The configurator has its own spec and doesn't exist yet: honestly disabled (slice 2). */}
          <Button
            variant="secondary"
            size="lg"
            disabled
            className="bg-surface-dark/40 backdrop-blur-md"
          >
            {labels.configure}
          </Button>
          <Button
            variant="primary"
            size="lg"
            onClick={() => {
              setState("trims");
              onShowTrims(active.id);
            }}
          >
            {labels.showTrims}
          </Button>
        </div>
      </div>
    </section>
  );
}

function Stat({ label, unit, children }: { label: string; unit: string; children: ReactNode }) {
  return (
    <div className="flex flex-col-reverse items-center text-center">
      <dt className="text-on-dark-muted mt-2 text-xs tracking-[0.2em] uppercase rtl:tracking-normal">
        {label}
      </dt>
      <dd className="flex items-baseline gap-1.5">
        <span className="text-4xl font-light tracking-tight tabular-nums lg:text-6xl rtl:tracking-normal">
          {children}
        </span>
        <span className="text-on-dark-soft text-sm">{unit}</span>
      </dd>
    </div>
  );
}
