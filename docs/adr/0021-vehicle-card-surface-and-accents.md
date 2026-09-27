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
