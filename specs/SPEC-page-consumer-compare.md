# Build Spec — Compare page

**Task ID:** `PAGE-CONSUMER-COMPARE`
**Depends on:** PAGE-CONSUMER-SHOWROOM (the tray, the `page_compare` flag and the `/compare` placeholder already exist).
**Design source (read-only):** `design-approved/showroom/compare.dc.html`.
**Standing rule: the approved design wins** on layout, visuals, copy and interaction; escalate only security, data, money, legal or consent questions.

## Goal

Replace the `/compare` placeholder with the approved side-by-side comparison of exactly 2 trims.

## Route and data

- `/compare?trims={trim-slug},{trim-slug}` (exactly 2; anything else → the page's own "pick two" state with a way back). Same host/brand resolution; `page_compare` flag unchanged.
- Data from the existing anonymous catalogue read (it already carries the resolved ledger); no new database access unless a needed field is missing (then extend the read path with its cross-tenant test).
- Rows: the union of both trims' ledger rows, grouped by the design's categories, each side showing its own resolved value; a missing value shows the design's empty mark.

## Behaviour notes

- **Show differences:** hides rows whose two values are identical.
- **Changing a side:** the design's picker panel swaps one trim; the URL follows (replace).
- **Swatches/views per side:** same no-faking rule as the brochure: swap only when a matching render exists.
- **Leads:** a lead opener per side, prefilled with that side's model and trim.
- At phone width, follow the design's stacking exactly.

## PRs (at most 2, against `main`)

1. The page, rows, show-differences, picker, URL handling.
2. Swatches/views, lead openers, motion, visual verification.

## Acceptance

- [ ] Visual verification against the design at 390/768/1440, EN and AR (screenshots attached).
- [ ] Differences-only is correct for identical, different and missing values.
- [ ] Deep links work (`/compare?trims=a,b` opened cold); invalid input never errors.
- [ ] RTL, reduced motion, a11y and performance gates green.
