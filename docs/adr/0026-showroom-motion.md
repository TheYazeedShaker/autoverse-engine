# 0026 — showroom motion: the approved timings as tokens, the intro curtain, reveals, glass

**Status:** accepted — 2026-09-28 (slice 8 of `PAGE-CONSUMER-SHOWROOM`; the dock's glass is the
owner's slice-4 decision: "solid for now, a tinted glass that passes contrast in slice 8")

## Context

Slices 2–7 deferred every enter/exit and scroll motion to slice 8: the intro curtain (spec §5.1),
reveals, the cards' car entrance and count-up, the drawer, sheet and modal motion, and the dock's
glass. The approved page defines each one with exact timings. CLAUDE.md fixes the character
(restrained, precise), the library (`motion/react` only), transform/opacity only, and reduced
motion as a blocking gate. The motion REV (`SPEC-storybook-foundations-REV-motion.md`, superseded)
names the semantic layer this grows.

## Decision

1. **The approved timings become tokens** (`design-tokens` `motion`, mirrored in `tokens.css`,
   tested for TS↔CSS parity):

   | Token                 | Value                                                          | Used by                                       |
   | --------------------- | -------------------------------------------------------------- | --------------------------------------------- |
   | `durationOverlay`     | 700 ms in, 480 ms out (`durationOverlayOut`), `easingGentle`   | drawer, sheet, modal, and their scrim in sync |
   | `durationCurtainHold` | 1200 ms from navigation start (max wait for the image 1800 ms) | the curtain's least time on screen            |
   | `durationReveal`      | 650 ms, `easingReveal`                                         | section and card reveals                      |
   | `staggerReveal`       | 120 ms                                                         | header → cards                                |
   | `durationCurtain`     | 800 ms, `easingCurtain`                                        | the intro curtain lifting                     |
   | `durationEntrance`    | 1600 ms, `easingEntrance`                                      | a card's car driving in                       |
   | `durationCount`       | 1750 ms, `easingDecelerate`                                    | a card's figures counting up                  |
   | `distanceEntrance`    | 2.5rem                                                         | the car's travel                              |
   | `distanceOverlay`     | 1.5rem                                                         | the modal's rise                              |

   Components use only the semantic layer (`packages/ui/src/motion.ts`): `curtainLift`,
   `curtainSkip`, `sectionReveal`, `carEntrance`, `statCount`, `overlayIn`/`overlayOut` (the
   scrim uses the same two). No springs: the approved page uses curves throughout, and "precise" reads better
   as a curve here.

2. **Reduced motion:** the curtain is never rendered; nothing is hidden, moved or counted (reveals,
   cars and figures are simply there); overlays open and close instantly. `useSeenOnce` reads the
   media query directly as well as through motion's hook (which caches it).

3. **Nothing is ever invisible without JavaScript.** Reveals, the car entrance and the count-up
   render final on the server. After hydration, only what starts **below the fold** is set to its
   start state, then animated when seen (IntersectionObserver, once). What is already in view never
   flickers.

4. **The intro curtain, once per session, read synchronously.** A constant inline script, rendered
   just before the curtain, marks `<html data-intro-seen>` from `sessionStorage` before the
   curtain is parsed; CSS then hides it, so a seen curtain never paints. `<html>` carries
   `suppressHydrationWarning` for that attribute only. The curtain stays at least 1.2 s from
   navigation start (owner, so it registers), then lifts smoothly (0.8 s) once the page's one
   high-priority hero image has decoded, waiting for it at most until 1.8 s. The first pointer,
   key, wheel or touch lifts it at once. It is decorative and `aria-hidden`, and a first key lifts it, so no keyboard user tabs
   behind it.
   - **It never covers the page for good** (code review). Both clocks count from navigation start
     (`hold − performance.now()`), so a slow hydration doesn't lengthen it. A CSS failsafe
     (`av-curtain-failsafe`: opacity and visibility, after the `delayCurtainFailsafe` token,
     3200 ms, above the longest JavaScript path of 1.8 s + 0.8 s) hides it even if no JavaScript
     runs, so the page still converts in the degraded case (CLAUDE.md).
   - Lifting writes the session flag only. It must **not** set `<html data-intro-seen>`: that
     attribute's CSS hides the curtain at once, which cut the lift short. That was the owner's
     "it vanishes before I can see it", introduced by the first review round and fixed in the
     second. A remount in the same document (a client navigation back) reads the flag from
     storage instead.
   - "Never mounted-then-hidden" (spec §5.1) is read as "never paints": a seen curtain is in the
     server HTML, hidden by CSS before its first paint, and unmounted at hydration.
   - Storage: one non-identifying UI flag (`av-intro-seen = 1`) in `sessionStorage`, gone when the
     tab closes. No cookie, nothing sent anywhere. If storage is refused, the curtain simply shows
     again next page. It belongs in the market's consent review with the other device storage (the
     EG consent question stays HUMAN ONLY).

5. **Glass: contrast that holds over any backdrop.** A glass tint is see-through, so its text is
   tested against the tint composited (sRGB) over pure white, Mist and Onyx
   (`design-tokens/src/glass.test.ts`).
   - First round: dark glass, Gunmetal at 88%. It passed, but the owner saw a dark solid bar.
   - **Now: light glass, Mist at 55%** under a 40 px blur with saturation, so it is visibly
     translucent. The dock only appears once the hero is scrolled past, so it floats over the
     light page. The names are Onyx: **5.9:1 at worst** (over pure Onyx beneath the glass),
     17.9–19.2:1 over the light page (panel, Mist, white). The active pill is solid Gunmetal with light ink (14:1).
   - One tint passes everywhere, so no tint switching by backdrop was needed. Measured
     alternatives: Mist at 50% gives 5.0:1 (too close to 4.5); Gunmetal at 60–70% fails over white
     (2.7–3.7:1 for the soft ink).

6. **Overlays:** Radix keeps the focus trap, Escape, scroll lock and focus return; motion's
   `AnimatePresence` with Radix `forceMount` keeps an overlay mounted until its exit ends
   (`packages/ui/src/overlay-motion.ts`). The drawer travels its own width from the inline end
   (mirrored in RTL) with a fade, the sheet its own height, the modal 1.5rem with a fade. After the
   owner's review they move slower and gentler: 700 ms in, 480 ms out, one long ease-out, the scrim
   on the same two.
   - The drawer's ~240 ms delay before its exit was a re-render of the whole showroom shell (the
     drawer's state lived there). Its state now lives in its own host (`SpecDrawerHost`), so opening
     and closing re-render only the drawer.
   - Hero: the trim pill floats over the top of the model area instead of taking layout space.
     Before, a model with trims had a model area 49 px shorter, starting lower, so the car sat
     25 px lower and met the backdrop's floor band differently: the "border" the owner saw at
     phone width. Now every model lays out alike. Over the backdrop and the car, the pill's fill
     is the tested dark glass (`glass.dark`, Gunmetal 88%: light ink ≥ 6.8:1 over any patch).
   - The filter sheet owns its open state (it can be uncontrolled) and closes itself when the
     window grows to `lg` while it is open, where the sidebar replaces it (its trigger is hidden
     at `lg`, so it can't open there).
   - The lead modal shares the overlay timings, so it is slower now too.

7. **One reduced-motion signal** (`packages/ui/src/use-reduced-motion.ts`): motion's hook plus a
   direct, live read of the media query, used by every animated component, so a preference changed
   while the page is open wins and tests can drive it. Under it the overlays are gone at once on
   close (tested per overlay).

8. **Paint cost:** the car entrance moves the image layer that carries the drop-shadow (not a child
   of a filtered parent), so the shadow is composited once. The count-up writes through a motion
   value (React keeps its text node) in tabular digits, so a stat never changes width.

## Consequences

- Tests that closed an overlay and expected it gone at once now wait for the exit.
- On a first visit the curtain covers the hero for at least 1.2 s (at most 1.8 s) plus the 0.8 s lift. The spec's
  LCP budget (≤ 2.5 s, mobile) is measured in slice 10 with the curtain in place.
- The hero's model change keeps its slice-4 motions (`countUp`, `crossfade`, `carouselSettle`).
- Nothing here runs on the configurator page, which has its own motion budget.
- **CSP (security review):** when a Content-Security-Policy lands, allow the curtain's inline
  script by its sha256 hash (it is a constant), with a test that recomputes the hash from
  `INTRO_CURTAIN_SCRIPT` and checks it against the header config. If the app adopts Next's nonces
  instead, this `<script>` gets the nonce too. If the script is blocked, a seen curtain can show
  again briefly; the JavaScript cap and the CSS failsafe still lift it.
- **Slice 10's mobile budget** should also measure: the blurred scrims fading (a backdrop blur
  re-renders each frame), the blurred dock over scrolling content, and about five observers per
  card (one per Reveal, CarEntrance and StatCount; a shared observer if it shows).
- The CI wall has no Storybook/axe browser run or reduced-motion job of its own. Reduced motion is
  enforced by `design-system-gates.test.ts` (structural) and the unit tests; a browser-level gate
  would be a `ci.yml` change (owner).
