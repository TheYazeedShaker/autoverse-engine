# Build Spec — Digital Brochure (model/trim detail page)

**Task ID:** `PAGE-CONSUMER-BROCHURE`
**Depends on:** PAGE-CONSUMER-SHOWROOM (done or in flight; reuses its tenancy, theme, catalogue read, drawer, compare, lead modal, motion tokens, asset standard).
**Design source (read-only):** `design-approved/showroom/brochure.dc.html`.
**Standing rule: the approved design wins** on layout, visuals, copy and interaction. Where this spec's words and the design differ on anything visual, follow the design and note it in the PR. Escalate only security, data, money, legal or consent questions.

## Goal

One page per model that sells it in depth: hero, trim choice, chapters of content, a light configurator (colours and views), the full spec ledger with "show differences", compare, and lead capture. Opened from a card's "Explore in detail".

## Route and data

- Route: `/models/{model-slug}`, with the selected trim in the query (`?trim={trim-slug}`); an unknown or unpublished model or trim → the shared not-found. Same host/brand resolution and flag pattern as the showroom (new flag `page_brochure`, default off).
- Everything comes from engine data through the anonymous read path. Extend `showroom_catalog` or add a sibling `brochure_catalog(subdomain, model_slug)` (implementer's choice, ADR). Same rules: published only, live brand-market only, exact field list, paired cross-tenant test.
- Content chapters come from `content_blocks` (published, ordered); the banner video from `banner_video`; the ledger from the spec tables resolved per trim; option swatches from `option_assignments`.
- A field the design shows that has no data yet: render the design's empty state, never invented values. A field the schema lacks entirely: Tier B.

## Behaviour notes (beyond what the design shows)

- **Trim picker:** switching trim updates every per-trim value (stats with count-up, price, ledger) without a page reload; the URL's `trim` follows (replace, not push).
- **Light configurator:** exterior/interior swatches and view switching. A swatch swaps the image **only if** a render exists for that (trim, colour, view) in the asset registry (`per_color_render` kind, ADR 0022 naming extended with the colour key). Otherwise the swatch is shown selected with no image swap. No colour is ever faked by tinting.
- **Show differences:** hides ledger rows whose value is identical across the model's published trims (computed with the existing `rowDiffers`).
- **Video:** muted, `playsinline`, poster first, paused off-screen, never autoplays under reduced motion or Save-Data.
- **Leads:** the lead modal opens with model and selected trim prefilled (types per the showroom openers decision). Compare uses the showroom's tray and limit (2).

## PRs (at most 3, each against `main`)

1. Read path + route + hero, trim picker, stats, ledger with show-differences.
2. Chapters, video, light configurator.
3. Compare/lead integration, reveals and motion per the motion standard, visual verification (below).

## Acceptance

- [ ] Visual verification: the agent renders the approved design file and the built page at 390, 768 and 1440 px, EN and AR, compares screenshots, fixes differences, and attaches both sets to the last PR.
- [ ] Per-trim switching updates every per-trim value; the URL follows.
- [ ] No faked colour renders; missing data shows the design's empty states.
- [ ] Cross-tenant test for the read path; reduced motion, RTL, a11y and performance gates green.
