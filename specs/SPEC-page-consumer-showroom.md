# Build Spec — Consumer Virtual Showroom (page 1)

**Task ID:** `PAGE-CONSUMER-SHOWROOM`
**Depends on:** ENGINE-CORE-1A (done). Replaces the dependency on `STORYBOOK-TIER2`: each page spec now carries its own component inventory, and every new component ships in `packages/ui` with story + tests as part of this task.
**Visual source of truth (the owner's approved copies, read-only; ADR 0010, _Approved design copies_. `design/` itself stays closed):**
`design-approved/showroom/showroom.dc.html`, `design-approved/showroom/vehicle-card.dc.html`, `design-approved/showroom/spec-drawer.dc.html`, plus their `assets/` and `uploads/` folders. Read them with the file tools only; the shell can't reach them.
The exports are prototypes, not code to copy: rebuild them in the system (tokens, Tier-1 primitives, `motion/react`, Radix). Match layout, proportions, states and motion. Never copy inline hex, px or hardcoded data out of them.
**Session requirement:** `design-approved/` is gitignored, so this task runs in a **local** session on the owner's machine. A cloud session can't see the design files.

---

## 1. Goal

The public entry page of a brand-market: a buyer browses the range, focuses a model, picks a trim, opens specs, compares, and leaves a lead. Everything shown comes from engine data. Nothing is brand-specific in code. The page is built against the demo brand, but a second brand must render correctly by data alone.

## 2. Route, tenancy, theming

- `apps/consumer`: the brand-market is resolved **server-side** from the host (`brand_markets.subdomain`) plus market. Unknown host or non-live market → 404 page (no brand leakage).
- Theme: `ThemeRepository.getForBrand()` → CSS custom properties injected in `<head>` server-side. Accent routing exactly as the theming REV (primary buttons, links, focus, active markers, small accents). Card, wedge and surfaces are brand-invariant.
- The whole page sits behind flag `page_showroom` (server-side, default **off**).

## 3. Data contract (engine → page)

Catalog data is fetched **server-side** through `packages/engine-core` repositories, published rows only. No client-side catalog fetch. Revalidate on a short interval (implementer's choice, recorded in an ADR).

| Design field                                                  | Engine source                                                                   |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| model id, name EN/AR, year, badge                             | `models.slug`, `names`, `year`, `badge_label`                                   |
| fuel label + fuel category (filter)                           | `models.fuel`, `fuel_category`                                                  |
| drive, transmission, seats, body                              | `models.drive`, `transmission`, `seats`, `body_type` (trim overrides where set) |
| 0–100, power, top speed (display + numeric for sort/count-up) | `models.accel/power/top_speed` (+ trim stat overrides)                          |
| efficiency label/value/icon (pump/battery/range)              | `models.efficiency_label/value/icon_kind`                                       |
| trims (name EN/AR, from-price, "price on request")            | `trims` + `trim_prices` for the market                                          |
| card image (side view) per trim                               | asset registry, view key `side`                                                 |
| hero image (front-¾) per trim                                 | asset registry, view key `front-34`                                             |
| model order (hero, dock, sections)                            | `models.order_index`                                                            |

Rules:

- **Any field the design shows that the schema lacks → Tier B escalation.** Never hardcode, never invent a column.
- Prices are formatted per market currency and locale. A missing price renders "Price on request", never 0.
- Missing asset → the designed placeholder state plus a logged warning, never a broken image.

## 4. Page structure (per design)

Intro curtain → top bar → hero (drag carousel) → floating model dock → content sheet: filter sidebar + per-model sections containing trim cards → compare tray → footer. Spec drawer and lead modal are overlays.

## 5. Component inventory (all in `packages/ui`, each with story + unit/interaction test + a11y in both directions)

1. **IntroCurtain**: once per session, rendered from a session flag read synchronously (never mounted-then-hidden), lifts after the first hero image decodes (cap ~900ms), any input skips, not rendered under reduced motion.
2. **TopBar**: brand logo (theme slot), market chip, EN/AR toggle, primary "Book a test drive" (opens LeadModal).
3. **ModelCarousel**: **Embla** (not hand-rolled): single track, 1:1 drag, velocity release (one model per flick), ~4% neighbour peek desktop, full-width mobile, keyboard arrows, RTL mirrored. Per-trim hero images (a model with 2 trims shows its trims per the design). Hero states **browse → focus → trims** exactly as the prototype (`heroState`), Escape steps back. Callouts: name, count-up key stats (tween from the previous model's values), from-price, **Configure** (primary) + **Show trims** (ghost). Loading: active slide `fetchpriority=high` with `srcset` 960/1440/1920, neighbours preloaded, rest lazy.
4. **ModelDock**: glassy pills, sliding active pill; two-way sync with the carousel; scroll-spy on sections (anchor line 30% from top, bottom of page = last, spy suspended during programmatic scroll until `scrollend`); hidden when fewer than 2 models are visible.
5. **FilterSidebar**: sticky glassy panel, search on top, collapsible groups **body · fuel · drive · seats** with counts derived from data, sort (**featured · name · power · 0–100**); mobile = bottom sheet. Filtering hides whole model sections and the dock reflects visible models only.
6. **ModelSection**: per model even with one trim (header band: name, descriptor, from-price, anchor id); trim cards in the 3-per-row grid, start-aligned, never stretched.
7. **VehicleCard**: the approved v3 card (`vehicle-card.dc.html`) rebuilt in the system: warm greige card + diagonal wedge (brand-invariant), car bleeding per design, inset spec panel, **Configure primary**, Explore in detail, Compare checkbox, "Technical data ›" opens SpecDrawer.
8. **SpecDrawer**: per `spec-drawer.dc.html`: side panel (full-height sheet on mobile), focus trap, Escape/scrim close, tabs → collapsible groups → rows from the **spec ledger** resolved for the selected trim (`resolveLedgerRow`), group notes, Configure CTA at the bottom.
9. **CompareTray**: max 3, floating glassy tray with thumbnails, per-item remove, "Compare N" → compare route (placeholder behind its own flag until PAGE-CONSUMER-COMPARE ships).
10. **LeadModal**: see §6. **Design gap:** the final export contains no form. Build to this spec using system form primitives (TextField, Select, Checkbox, Button) and the modal's existing visual language.
11. **Footer**: brand description EN/AR, link columns, social icons, from `brand_markets` config.

## 6. Lead capture (conversion path — highest priority for correctness)

- Fields: full name, phone (EG format hint + validation), city (select), model/trim of interest (prefilled from context, editable), preferred time (today / this week / just exploring), **required consent checkbox** with the market's consent text, versioned as `consent_text_version`.
- Opened from: TopBar CTA, hero, cards/sections, SpecDrawer; the type follows the CTA (test drive / quote / contact).
- Submit follows the **page contract in `docs/runbooks/public-capture-rollout.md` exactly**: headers `X-Autoverse-Key` + `X-Autoverse-Market`, a `submission_id` minted once per submit and **reused on retry**, a fresh Turnstile token per attempt (tokens are single-use), handling of 201 / 403 / 409 / 422 / 429 / 503 with human-readable states. 503/network errors → retry with backoff, same `submission_id`.
- Success state: confirmation plus a WhatsApp shortcut (`brand_markets.whatsapp_number`).
- Publishable key and site key come from env/config, never inline. Nothing else about the brand is client-trusted.

## 7. Event capture

- Journey events go to `ingest-event` using the existing discriminated `EventSchema` kinds. Needed kinds, if not present, are added in `packages/types` (code-owned PR): showroom view, model focus, trim select, filter/sort change, drawer open (+ tab), compare add/remove, CTA click, lead modal open/submit/outcome.
- Batched, fire-and-forget (the endpoint returns 202 by design), session id per visit, never blocks UI.
- **Consent gating for EG is a Tier C decision** (per-market consent defaults are still unset). Build the gate (events queue client-side until the market's consent rule allows sending), wire it to `brand_markets.consent_defaults`, and escalate HUMAN ONLY for the EG value before this page takes real traffic.

## 8. Cross-cutting requirements

- **EN/AR** with full RTL mirroring (carousel direction, dock, drawer side, filters); Cairo for Arabic; every string from the i18n layer (the prototype's `L` strings are the copy source).
- **Reduced motion:** no curtain, no count-up tweens, instant carousel settle, reveals present immediately. Enforced by the existing reduced-motion gate.
- **A11y:** zero axe violations in both themes/directions; carousel operable by keyboard with live-region announcement of the active model; drawer and modal trap focus and restore it.
- **Sparse rule:** one visible model → static hero, no dock, no drag.
- **Performance (budgets checked in CI on a preview build, mobile profile):** LCP ≤ 2.5s, CLS ≤ 0.05, hero image the only high-priority fetch, no layout-affecting animation (transform/opacity only).

## 9. Slices (one PR each, against `main`)

1. Route + host→brand-market resolution + theme injection + flag + data loaders (no UI beyond a skeleton).
2. VehicleCard + ModelSection + grid (static data from loaders).
3. FilterSidebar + search + sort + mobile sheet.
4. ModelCarousel + hero states + count-up + ModelDock + scroll-spy.
5. SpecDrawer on the resolved ledger.
6. CompareTray.
7. LeadModal + capture contract + Turnstile (end-to-end against the local stack).
8. IntroCurtain + reveals + motion polish.
9. Event capture + consent gate.
10. E2E + visual parity + performance pass.

## 10. Acceptance

- [ ] Visual parity with the design at 1440 and 390 widths, EN and AR, reviewed against screenshots of the prototype.
- [ ] Playwright E2E: browse → focus → trims → drawer → compare → lead submit returns 201 on the local stack; a retry reuses `submission_id` and yields 409-safe behaviour.
- [ ] A second seeded demo brand with a different accent renders correctly with zero code changes.
- [ ] Filters and counts derive from data; the dock hides below 2 visible models.
- [ ] Reduced-motion, RTL, a11y and performance budgets green in CI.
- [ ] No brand name, price, spec or image path hardcoded anywhere outside seed/test fixtures.
- [ ] Consent value for EG escalated HUMAN ONLY (not decided by the agent).
- [ ] PROGRESS.md and BACKLOG.md current.

## Out of scope

Trim details, compare, and configurator pages (their own specs); CMS editing (admin portal); analytics dashboards.
