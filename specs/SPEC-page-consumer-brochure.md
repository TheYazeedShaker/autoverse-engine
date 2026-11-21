# Build Spec — Digital Brochure (model/trim detail page)

**Task ID:** `PAGE-CONSUMER-BROCHURE`
**Depends on:** PAGE-CONSUMER-SHOWROOM (done or in flight; reuses its tenancy, theme, catalogue read, drawer, compare, lead modal, motion tokens, asset standard); `packages/configurator` (ADR 0028) for the viewers; the brochure model (A24, D23).
**Design source (read-only):** `design-approved/brochure/`: the v3 brochure proof, which the owner copies in (D16). Nothing in this spec is built until it is there.
**Standing rule: the approved design wins** on layout, visuals, copy and interaction. Where this spec's words and the design differ on anything visual, follow the design and note it in the PR. Escalate only security, data, money, legal or consent questions.

## Goal

One page per model that sells it in depth: hero, trim choice, the `brochure_layouts` sections, the viewers (colours and views), the full spec ledger with "show differences", compare, and lead capture. Opened from a card's "Explore in detail".

## Route and data

- Route: `/models/{model-slug}`, with the selected trim in the query (`?trim={trim-slug}`); an unknown or unpublished model or trim → the shared not-found. Same host/brand resolution and flag pattern as the showroom (new flag `page_brochure`, default off).
- Everything comes from engine data through the anonymous read path. Extend `showroom_catalog` or add a sibling `brochure_catalog(subdomain, model_slug)` (implementer's choice, ADR). Same rules: published only, live brand-market only, exact field list, paired cross-tenant test.
- **One brochure model** (D23). Facts come from Engine tables: brand, markets, theme, logo, footer, socials, models, trims, prices, colours, the spec ledger (resolved per trim) and assets. The editorial part (sections, copy, angles and crops, highlight cards, interface strings, the CTA mode) is one versioned `brochure_layouts` document per model and market, Zod-validated, with EN/AR copy pairs.
- The banner video comes from `banner_video`; option swatches from `option_assignments`.
- The Nmesis brochure tool's published pages stay read-only until each brand's brochure is re-published through this model.
- The template's rules carry over (`docs/merge-map/showroom.md` §3.5): the configurator manifest decides which trims and colours exist; an unknown value renders "to be confirmed", never a typed number; a missing asset drops its section.
- A value with no data yet renders "to be confirmed", and a missing asset drops its section, never leaving an empty box. Never invented values. A field the schema lacks entirely: Tier B.
- The showcase's `/brochure/<model>` and `/brochure-v3/<model>` redirect here with the query kept (D20).

## Behaviour notes (beyond what the design shows)

- **Trim picker:** switching trim updates every per-trim value (stats with count-up, price, ledger) without a page reload; the URL's `trim` follows (replace, not push).
- **Viewers and swatches:** the manifest decides which colours exist, and a swatch changes the viewer (`packages/configurator`). A static render swaps **only if** one exists for that (trim, colour, view) in the asset registry (`per_color_render` kind, ADR 0022 naming extended with the colour key). No colour is ever faked by tinting.
- **Show differences:** hides ledger rows whose value is identical across the model's published trims (computed with the existing `rowDiffers`).
- **Video:** muted, `playsinline`, poster first, paused off-screen, never autoplays under reduced motion or Save-Data.
- **Leads:** the lead modal opens with model and selected trim prefilled (types per the showroom openers decision). Compare uses the showroom's tray and limit (2).

## PRs (at most 2, each against `main`)

The brochure model's database and function PRs come first, in the admin track (A24, A25).

1. Brochure I (C7): the read path for `brochure_layouts`, the server-rendered template, hero, trim picker, specs with show-differences.
2. Brochure II (C8): the stage, viewers, boot film, highlights, interior, Arabic, compare/lead integration, reveals and motion per the motion standard, visual verification (below).

## Acceptance

- [ ] Visual verification (rule B): the agent renders the approved design and the built page at 390, 768 and 1440 px, EN and AR, compares them, fixes differences, and shows both sets in the chat; the PR gets a text-only note.
- [ ] Per-trim switching updates every per-trim value; the URL follows.
- [ ] No faked colour renders; an unknown value shows "to be confirmed", and a missing asset drops its section.
- [ ] Cross-tenant test for the read path; reduced motion, RTL, a11y and performance gates green.
