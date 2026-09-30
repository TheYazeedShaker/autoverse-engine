# 0021 — the vehicle card is white, with the brand accent as its small accents

**Status:** accepted — 2026-09-27 (owner, `#build-decisions`, decision 1B + 2A)

## Context

The showroom spec named `design-approved/showroom/vehicle-card.dc.html` as the visual source of
truth, and its §5.7 described that card as a "warm greige card + diagonal wedge". The theming REV
routed `muted_hex` to a "card wedge tint". But the approved file is a **white** card with **no
wedge**, with red detailing (the year, icons and dividers) and a filled Configure button. No greige
token existed anywhere.

## Decision

1. **Surface (1B): a white card, no wedge**, exactly as the approved file. White joins the palette
   as a **paired surface** under the contrast invariant:
   - `palette.white` / `--av-white`, and the surface `--av-surface-white` with `--av-on-white`
     (Onyx) and `--av-on-white-muted` (Slate);
   - registered in `surfaces` (tokens.ts), so the §4.2 pairing test covers it;
   - listed in the CSS pair test together with `--av-accent`.

   The card surface is brand-invariant.

2. **Accents (2A): the year, the icons and the attribute dividers use the brand accent**
   (`--av-accent`). They are added to the REV's accent list as **"small accents"**. The Configure
   button stays the brand accent (primary buttons; spec §2).

Documents amended in the same change:

- spec §5.7: now "white card with no wedge";
- spec §2: "card, wedge and surfaces" becomes "the card and surfaces";
- theming REV, "Accent routing": the `muted_hex` → wedge-tint routing is removed, and the vehicle
  card's small accents are added.

`muted_hex` stays in `brand_themes`. It is still derived, but nothing routes to it now.

## Contrast: the accent is already validated against white

The owner asked for this to be confirmed here. It is. `validate-theme` gates every brand theme on
four pairs (theming REV, "Edge function validate-theme", step 3), and the database enforces the
same pairs as CHECKs on `brand_themes` (`20260922223000_theming.sql`):

| Pair                           | Minimum | Enforced by                                                   |
| ------------------------------ | ------- | ------------------------------------------------------------- |
| on-accent on accent            | 4.5:1   | `validate-theme`; CHECK `brand_themes_aa_on_accent`           |
| on-accent on hover             | 4.5:1   | `validate-theme`; CHECK `brand_themes_aa_on_hover`            |
| accent text on the Mist canvas | 4.5:1   | `validate-theme`; CHECK `brand_themes_aa_accent_on_canvas`    |
| **accent text on white**       | 4.5:1   | `validate-theme`; CHECK **`brand_themes_aa_accent_on_white`** |

So for **every** stored theme:

- the year (text) clears 4.5:1 on the white card;
- the icons (non-text, which need 3:1) clear it with margin;
- Configure's label clears 4.5:1 on its fill.

For example, the demo accent `#B50D18` gives 6.92:1 on white (computed with validate-theme's own
`contrastRatio`). The neutral default accent (Slate) is checked on white in the token test
(`--av-surface-white` → `--av-accent`).

The attribute dividers are drawn as a 25% tint of the accent, as in the approved file. They are
decorative separators, which WCAG 1.4.11 doesn't require to reach 3:1; the labels either side carry
the meaning.

Not covered by these pairs: `focus_hex`. It has only a format CHECK, so nothing in the database
enforces 3:1 against Mist or white. validate-theme derives it to reach 3:1 against Mist, but
that is not guaranteed at the database layer. This is tracked in BACKLOG ("Contrast check for the
brand focus colour in the database", trigger: before the first real brand goes live).

## Consequences

- VehicleCard's `SURFACE` is white, and its inset spec panel is white too (as approved), set apart
  by a hairline border.
- The white card sits on the grey page panel (`--av-surface-panel`), matching the approved page.
- Any future accent use on a surface other than Mist or white (for example the Gunmetal hero)
  needs a new validated pair first (theming REV, as amended).

## Amendment (owner, slice 8 review, 2026-09-30): the card's width range sets the grid

The range grid used fixed breakpoints (1 / 2 / 3 columns at `md` / `xl`). Narrowing the window made
the cards thinner and thinner before a breakpoint dropped a column: measured at 248–288 px with 3
columns from 1290 px, and 281 px at 1030 px.

- **The column count comes from the card's minimum width**, never from breakpoints:
  `repeat(auto-fill, minmax(min(100%, max(min-width, (100% − 2 gaps) / 3)), 1fr))`. That gives as
  many columns as keep every card at least the minimum wide, and **at most three**. The utility is
  `av-card-grid` (`packages/ui/src/styles/tailwind.css`). `auto-fill` keeps the empty tracks, so a
  model with one or two trims never stretches its cards.
- **Minimum 336 px** (`vehicleCard.minWidth` / `--av-card-min-width`, TS↔CSS parity tested). It was
  measured on the card at 10 px steps:
  - English content fits from 310 px. Below that, the price overflows and "0 – 100 km/h" is cut off.
  - Arabic needs 330 px, because "السرعة القصوى" is cut off below it.
  - 336 px (21 rem) clears both with a margin, and still fits one column on a 390 px phone (343 px).
  - The approved card's own compact layout (container ≤ 24 rem) shows it was designed to render
    this narrow.
- **Maximum 560 px**, the approved card's `max-width` (`vehicleCard.maxWidth` /
  `--av-card-max-width`). Each grid cell stops there and stays start-aligned, so a lone column may
  leave space beside it (for example 1030–1150 px, where the filter sidebar appears).
- **Checked in the browser** (fixture, EN and AR) at every width from 390 to 1440 px in 20 px steps,
  plus 1440, 1600, 1920, 2560 and 3200 px:
  - the narrowest card is 341.7 px and the widest 560 px, with no text cut off or overflowing;
  - one column up to 810 px, two from 830 px, one again from 1030 px (the sidebar takes its width),
    two from 1170 px, three from about 1600 px, never more than three;
  - the 40 px gap at `2xl` is part of the track maths.
- Spec §5.6's "3-per-row grid" now reads "at most 3 per row, from the card's minimum width".
