# 0023 — showroom hero and model dock: states, framing, calls to action

**Status:** accepted in part — 2026-09-28. Decisions 1, 2, 3 and 6 are built. Decisions 4 and 5 are
built as recommended but **await the owner's answer** in `#build-decisions` (see _Open_).

## Context

Slice 4 builds the hero carousel and the model dock (spec §5.3–5.4) from the approved page. The spec
and the approved file disagree in three places, and one part of the page (the TopBar, §5.2) is in no
§9 slice. The architect agent reviewed the conflicts against the production plan, the theming REV and
ADR 0021 before any of this was escalated.

## Decisions

1. **Hero states are real state with no visual difference**, as in the approved page, where
   `heroState` drives only Escape.
   - `browse` is the start.
   - `focus` begins on any explicit model pick: a name, an arrow, an arrow key, a drag that settles,
     or the dock.
   - `trims` begins on a trim pill pick or "Show trims".
   - Escape steps back trims → focus → browse.
   - The state is reported (`onStateChange`) for the journey events (slice 9, §7) and gives the §10
     E2E path (browse → focus → trims) something to check.
2. **Hero framing.** Every hero car sits in the fixed 16:9 `front-34` box of `CarImageFrame` and
   fills **80%** of its width (token `carFrame.heroFill` / `--av-car-fill-hero`), centred and
   bottom-aligned: the same rule and the same value as the side view (ADR 0022). (Since slice 8 the
   side view is 2.8 : 1 and vertically centred; the hero keeps bottom alignment.)
   - Trimmed front three-quarter masters are wider than 16:9, so width is the binding dimension. Every
     car therefore renders at the same width and on the same ground line, with the same margin as on
     the cards.
   - The box is as large as the slide allows: `min(slide width, slide height × 16/9)`, from container
     query units.
3. **Carousel mechanics.** Embla, never hand-rolled:
   - 1:1 drag and one model per flick; loop when there are enough models; every slide centred;
   - a 92% slide from `md` (a 4% neighbour peek each side), full width below;
   - mirrored in RTL, with arrow keys following the reading direction;
   - neighbours dimmed with opacity only (no `filter` animation).
   - Loading: the first model's first trim is the page's one `fetchpriority=high` image (preloaded).
     Its neighbours load eagerly, the rest lazily. The srcset widths are 960/1440/1920.
4. **Calls to action (awaiting the owner).** The file's styling with the spec's action:
   - **Configure** is glass/secondary and disabled until the configurator exists (as on the cards,
     slice 2).
   - The Mist-filled primary is labelled **"Show trims"** and scrolls to the model's section.
   - Why: §5.3's "primary" would put the brand accent on the dark hero, and the accent is validated
     only against Mist and white (theming REV; ADR 0021). The trim-details page behind the file's
     "Show Details" is out of scope.
5. **No from-price in the hero (awaiting the owner).** The approved hero shows no price, and the name
   row already names the model. The from-price stays in each ModelSection header (§5.6). This changes
   §5.3's text.
6. **Semantic motion.** `packages/ui/src/motion.ts` maps named motions onto the motion tokens, so
   components never use raw timings:
   - `countUp`: the stats tween from the previous model's values;
   - `pillSlide`: the dock's pill, transform only;
   - `crossfade`: a trim's image swap, opacity only.
   - Each is instant under reduced motion. Slice 8 grows this into the motion REV's full token set.

7. **Embla's options are stable.** The start index is read once, and the options object is memoised.
   embla-carousel-react re-initialises whenever its options change, which would cut a scroll short on
   every model change; a test asserts the same options object across model changes.
8. **Tokens.**
   - The slide width is a token: `heroCarousel.slide` / `--av-hero-slide` (92%). The carousel's class
     and the page's image `sizes` both read it.
   - The carousel settle is the `carouselSettle` semantic motion (Embla's own duration units).
   - The srcset is 960/1440/1920 as §5.3 asks; `deviceSizes` also keeps 640 for the cards' 1-column
     phone widths.

## Model dock

- It shows **only the models the filters leave visible**, in their display order, and is hidden
  below 2.
- It appears once the hero is scrolled past.
- There is one active model, shared with the carousel and with scroll-spy:
  - the anchor line is 30% from the top, and at the bottom of the page the last section is current;
  - the spy is suspended during a programmatic scroll until `scrollend` (1.6 s fallback).
- Hidden, it is `inert`. Picks scroll with `scrollIntoView`, clear of the dock (`scroll-mt`).
- A new pick cancels the previous pick's pending release (`createSpyHold`), so an earlier timeout
  never lifts a later hold.
- **Opaque, not glassy.** The dock sits on the opaque `surface-dark`, not the approved page's
  translucent glass. It floats over the light panel, so a translucent dark would put its text on an
  unvalidated mix; on the opaque surface the text is the AA-paired dark set.
- The hero's live region announces only moves made in the carousel. Scroll-spy updates while the
  visitor reads the range stay silent.

## Open (owner, `#build-decisions`)

- Decisions 4 and 5 above (the spec §5.3 text changes).
- **The TopBar (§5.2) is in no §9 slice.** The recommendation is to ship it next, with "Book a test
  drive" disabled until slice 7 wires the LeadModal. Its EN/AR toggle also fixes the static
  `<html lang dir>`. Not built in slice 4. The hero is therefore full-viewport height, not the
  approved `100vh − 64px`.
- **The hero backdrop:** the brand-invariant image the approved page uses is not in the repo. The
  shell cannot copy it out of the approved design folder (ADR 0010), so it must be added by hand at
  `apps/consumer/public/showroom/hero-backdrop.jpg`.
  - `next.config.js` turns it on only when the file exists, so a missing file never becomes a broken
    request.
  - Until then the stage is the plain dark surface.

## Consequences

- Journey events (slice 9) hook into `onStateChange`, the active-model changes and the dock picks.
- The count-up and the dock pill depend on animation frames; a background tab finishes them when it
  becomes visible again.
