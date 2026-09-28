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

   | Token              | Value                       | Used by                      |
   | ------------------ | --------------------------- | ---------------------------- |
   | `durationOverlay`  | 550 ms, `easingEmphasized`  | drawer, sheet, modal landing |
   | `durationReveal`   | 650 ms, `easingReveal`      | section and card reveals     |
   | `staggerReveal`    | 120 ms                      | header → cards               |
   | `durationCurtain`  | 820 ms, `easingCurtain`     | the intro curtain            |
   | `durationEntrance` | 1600 ms, `easingEntrance`   | a card's car driving in      |
   | `durationCount`    | 1750 ms, `easingDecelerate` | a card's figures counting up |
   | `distanceEntrance` | 2.5rem                      | the car's travel             |
   | `distanceOverlay`  | 1.5rem                      | the modal's rise             |

   Components use only the semantic layer (`packages/ui/src/motion.ts`): `curtainLift`,
   `curtainSkip`, `sectionReveal`, `carEntrance`, `statCount`, `overlayIn`/`overlayOut`,
   `scrimFade`. No springs: the approved page uses curves throughout, and "precise" reads better
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
   `suppressHydrationWarning` for that attribute only. The curtain lifts when the page's one
   high-priority hero image decodes, capped at 900 ms, or at the first pointer, key, wheel or
   touch. It is decorative and `aria-hidden`, and a first key lifts it, so no keyboard user tabs
   behind it.
   - **It never covers the page for good** (code review). The cap counts from navigation start
     (`900 ms − performance.now()`), so a slow hydration doesn't lengthen it. And a CSS failsafe
     (`av-curtain-failsafe`: opacity and visibility, after the `delayCurtainFailsafe` token,
     2000 ms) hides it even if no JavaScript runs at all, so the page still converts in the
     degraded case (CLAUDE.md).
   - Lifting also marks `<html>`, and the check reads storage too, so a remount in the same
     document (a client navigation back) stays hidden; React doesn't re-run the inline script.
   - "Never mounted-then-hidden" (spec §5.1) is read as "never paints": a seen curtain is in the
     server HTML, hidden by CSS before its first paint, and unmounted at hydration.
   - Storage: one non-identifying UI flag (`av-intro-seen = 1`) in `sessionStorage`, gone when the
     tab closes. No cookie, nothing sent anywhere. If storage is refused, the curtain simply shows
     again next page. It belongs in the market's consent review with the other device storage (the
     EG consent question stays HUMAN ONLY).

5. **Glass: contrast that holds over any backdrop.** A glass tint is see-through, so its text is
   tested against the tint composited (sRGB) over pure white, Mist and Onyx
   (`design-tokens/src/glass.test.ts`). `glass.dark` is Gunmetal at **88%**: on-dark and
   on-dark-soft clear AA over all three (the soft ink is about 6.8:1 over white). The blur and
   saturation are decoration on top. At 80% the soft ink would fail over white, so the alpha is a
   contrast decision, not a look.

6. **Overlays:** Radix keeps the focus trap, Escape, scroll lock and focus return; motion's
   `AnimatePresence` with Radix `forceMount` keeps an overlay mounted until its exit ends
   (`packages/ui/src/overlay-motion.ts`). The drawer travels its own width from the inline end
   (mirrored in RTL), the sheet its own height, the modal 1.5rem with a fade. The filter sheet
   now owns its open state (it can be uncontrolled) and closes itself when the window grows to
   `lg` while it is open, where the sidebar replaces it (its trigger is hidden at `lg`, so it
   can't open there).

7. **One reduced-motion signal** (`packages/ui/src/use-reduced-motion.ts`): motion's hook plus a
   direct, live read of the media query, used by every animated component, so a preference changed
   while the page is open wins and tests can drive it. Under it the overlays are gone at once on
   close (tested per overlay).

8. **Paint cost:** the car entrance moves the image layer that carries the drop-shadow (not a child
   of a filtered parent), so the shadow is composited once. The count-up writes through a motion
   value (React keeps its text node) in tabular digits, so a stat never changes width.

## Consequences

- Tests that closed an overlay and expected it gone at once now wait for the exit.
- On a first visit the curtain covers the hero for up to about 900 ms plus the lift. The spec's
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
