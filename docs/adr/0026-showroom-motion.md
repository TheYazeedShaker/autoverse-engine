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

1. **The motion standard** (owner, 2026-09-29; research-based; it supersedes the earlier rounds'
   timings). These are the **only** motion tokens (the tokens package's `motion`, mirrored in
   `tokens.css`; a test fails if any other duration or easing token exists):

   | Pair    | Duration | Curve                             | Used by                                                                                                                  |
   | ------- | -------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
   | overlay | 500 ms   | `cubic-bezier(0.32, 0.72, 0, 1)`  | spec drawer, filter sheet and their backdrop; enter = exit; transform only                                               |
   | modal   | 300 ms   | `cubic-bezier(0.23, 1, 0.32, 1)`  | lead modal and its backdrop (enter = exit); the curtain's skip; hovers, state changes and the dock appearing (see below) |
   | move    | 250 ms   | `cubic-bezier(0.77, 0, 0.175, 1)` | dock marker, carousel settle, trim crossfade, a chevron turning                                                          |
   | reveal  | 500 ms   | `cubic-bezier(0.23, 1, 0.32, 1)`  | scroll reveals, a card's car entrance, count-ups; stagger 120 ms (unchanged)                                             |
   | curtain | 800 ms   | the overlay curve                 | the curtain's lift, after its 1.2 s hold                                                                                 |

   Rules: **never ease-in** on UI motion (the move pair is ease-in-out, for things already on
   screen); enter and exit share a pair; transform and opacity only; reduced motion is instant.
   - **Hovers, colour/state changes and the dock appearing** were not named in the standard. They
     are feedback or UI entering, which the rules keep on an ease-out, so they use the modal pair
     (a quick ease-out). Every bare Tailwind `transition` utility defaults to it
     (`--default-transition-duration` / `-timing-function`), so nothing falls back to Tailwind's
     own 150 ms. **Decided (owner, 2026-09-30, `#build-decisions`): A**, the modal pair, as built.
   - The carousel settle is Embla's own damped spring on a fixed 60 fps step
     (`v += gap / duration; v *= 0.68`): it takes a `duration` in steps and no curve. Simulated
     (Embla v8.6 `ScrollBody`): 15 steps (250 ms ÷ 16.7 ms) reach 95% at 250 ms but overshoot 1.06%
     (about 15 px on a wide slide, a visible bounce); **18** reaches 95% at about 317 ms with 0.14%
     overshoot (about 2 px, invisible), the closest to the move token without a bounce. Its shape is
     a damped ease-out, not the in-out curve: a library limit. It governs programmatic moves
     (arrows, dock, keys); a drag release settles at Embla's own speed.
   - The curtain and the car entrance also animate the `transform` property with matching units,
     so they run on the compositor like the overlays. The car entrance's former 75 ms start delay
     is gone: it isn't part of the standard.
   - **Checked in a real browser** (the owner's "fast and uneased" report), by reading each
     element's Web Animations (`element.animate` calls and `getAnimations()`):
     - The backdrop animated correctly, but the **panel had no browser animation at all**: motion
       drove its `x` from JavaScript frame by frame, and the drawer's own render starved those
       frames. Overlays now animate the `transform` property itself, which motion hands to the
       compositor.
     - After the fix: drawer and sheet run `transform` only, 500 ms, on the overlay curve, both
       ways, with the backdrop in sync; the modal runs `transform` and opacity, 300 ms, on the
       modal curve, both ways.
     - The same check caught a unit mismatch (`translate3d(0, …)` against `1.5rem` interpolated
       to an invalid unitless value). Resting and away positions now carry the same units, and a
       unit test holds that.

   **Sources**
   - The overlay pair is the iOS sheet curve and duration as used by the Vaul drawer:
     [Building a drawer component](https://emilkowal.ski/ui/building-a-drawer-component) (Emil
     Kowalski, Vaul's author: `transform 0.5s cubic-bezier(0.32, 0.72, 0, 1)`).
   - The ease-out (`0.23, 1, 0.32, 1`, for UI entering and exiting) and ease-in-out
     (`0.77, 0, 0.175, 1`, for on-screen movement) curves, and "never ease-in on UI":
     [emilkowalski/skills, emil-design-eng](https://github.com/emilkowalski/skills/blob/main/skills/emil-design-eng/SKILL.md).
   - The exact durations per surface are the owner's.

   Components use only the semantic layer (`packages/ui/src/motion.ts`: `overlay`, `modal`,
   `pillSlide`, `crossfade`, `countUp`, `carouselSettle`, `sectionReveal`, `carEntrance`,
   `statCount`, `curtainLift`, `curtainSkip`) and `packages/ui/src/overlay-motion.ts`.

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
   - **Colour (owner, 2026-09-30): Onyx**, not the Gunmetal dark surface. It is its own paired
     surface token, `surfaces.curtain` / `--av-surface-curtain` with `--av-on-curtain` (Mist) and
     `--av-on-curtain-muted`, AA-checked in both contrast tests; a test pins it to Onyx.
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
   (mirrored in RTL), the sheet its own height (both transform only), the modal 1.5rem with a
   fade. Their timings are the motion standard (point 1).
   - The drawer's ~240 ms delay before its exit was a re-render of the whole showroom shell (the
     drawer's state lived there). Its state now lives in its own host (`SpecDrawerHost`), so opening
     and closing re-render only the drawer.
   - Hero: the trim pill floats over the top of the model area instead of taking layout space.
     Before, a model with trims had a model area 49 px shorter, starting lower, so the car sat
     25 px lower. Now every model lays out alike (measured at 375 px: the same hero height, car
     frame and stats position for a model with trims and one without). Over the backdrop and the
     car, the pill's fill is the tested dark glass (`glass.dark`, Gunmetal 88%: light ink ≥ 6.8:1
     over any patch).
   - **The "border" under the model names at phone width (owner, 2026-09-30) was the names row's
     scrollbar**, not the layout: the row is `overflow-x-auto`, and when the names overflow a
     phone (five models, the active one larger) its scrollbar thumb draws a grey bar under them.
     Reproduced at 375 px. The row now hides its scrollbar (`scrollbar-width: none` and the WebKit
     pseudo-element) and scrolls itself to keep the active name centred (the row only, never the
     page). That scroll is instant, like the name's own size change: a native smooth scroll would
     be browser-timed motion outside this standard. The hero's height doesn't depend on it.
     (The page's own smooth `scrollIntoView` for "Show trims", from slice 4, predates this
     standard; it is a page scroll, not an animation, and is instant under reduced motion.)
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
