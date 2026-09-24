# AUTOVERSE ADMIN PORTAL — DESIGN BRIEF (paste as the first message of the project)

## Goal & audience

You are designing the **Autoverse Admin Portal** — the operator control plane of an automotive SaaS platform. Everything a car brand's public surfaces show (virtual showroom, model/trim pages, comparison, configurator) is **generated from data managed here**: operators onboard a brand, upload/curate its catalog, approve AI-generated content, set pricing and entitlements, and the consumer pages render themselves — no code, no redeploys. Users: a small internal operations team (2–10 people, expert users, daily heavy use). Optimize for density, speed, and zero ambiguity — this is a professional tool, not a marketing site.

## Design language (same system, admin density)

- Tokens: Mist `#F4F7F5` canvas · Onyx `#08090A` ink/primary · Gunmetal `#222823` (left nav + accents) · Slate/Platinum muted · the muted semantic set (error/success/warning/info) is used freely here for states, badges, and alerts. Google Sans Flex (+ Cairo where Arabic content is entered/previewed).
- Utilitarian density: 13–14px base, compact paddings, real tables with sticky headers, hairline dividers; radius 10/14; motion minimal (150–250ms fades/slides only); no reveals, no hero drama.
- **App shell:** slim dark (Gunmetal) left sidebar — logo mark top, icon+label nav groups, collapsible to icon rail; top bar: global search, environment badge, notifications, staff avatar. Content area on Mist. RTL-ready but the admin itself ships EN-first.
- **Universal data-entry patterns (use everywhere):**
  - **EN/AR pair**: every customer-facing text field renders as twin inputs (EN, AR side-by-side or tabbed) — never a lone field.
  - **Publish states**: Draft → Ready → Published badges on models, trims, content, themes; nothing customer-visible until Published.
  - **Per-market values**: prices and availability edit as a small matrix (rows = markets) with "Price on request" toggle per cell.
  - **Vocabulary-locked inputs**: option IDs (colors, interiors, views) are pickers from the shared registry — free text is impossible.
  - **Destructive/publishing actions** confirm inline and note "audit-logged".

## Pages (design one per request, this order)

### 1 · Shell + Overview

Sidebar (groups: Overview · Brands · Catalog · Pipeline · Content · Leads · Analytics · Commercial · System) + top bar. Overview = ops cockpit: KPI row (live brands, models published, leads today, sessions today) · Pipeline snapshot (deliveries by stage, stalled flagged) · Approvals queue count (content awaiting review) · Alerts feed (job stalls, lead DLQ = red/paged, reconciliation gaps, theme validation failures) · recent activity (audit trail excerpt).

### 2 · Brands — list + Brand detail

List: table (logo, name, markets, status, tier, surfaces enabled, leads 7d, MRR) + "New brand" flow (name, markets, subdomain preview `{brand}.platform.com/{market}`).
Brand detail — tabs:

- **Profile & Markets**: identity, market rows (currency, locales incl. RTL, consent defaults, URL, live/draft toggle per market).
- **Theme**: accent picker with live derived preview (on-accent auto black/white, hover/muted/focus shades shown) and **AA validation that blocks save** naming the failing pair; logo uploads (light/dark surface variants), favicon. Preview strip renders sample components (buttons, links, active pill) in the theme.
- **Surfaces & Tier** (entitlements): toggles per market — Showroom / Model pages / Configurator; brand-dashboard tier select; free-period window; note: "capture is never gated — upgrades reveal history retroactively."
- **CTAs & Contact**: WhatsApp number, test-drive lead routing (emails, webhook URL), footer description (EN/AR pair), footer link columns editor.
- **Billing**: subscription (tier, term, status), invoices table (create, send, mark paid, PDF), payment notes.

### 3 · Catalog — models list + Model editor (the deepest page)

Models list per brand: ordered table (drag to reorder = hero/dock adjacency AND section order), thumbnail, name, body, fuel, trims count, price-from, publish state.
Model editor — tabs:

- **Identity**: names (EN/AR pair), year, body type, badge label, fuel + fuel category, drive, transmission, seats, ordering position, publish state.
- **Card stats**: accel / power / top speed (display string + numeric), efficiency row (label EN/AR, value, icon kind: pump/battery/range), optional torque.
- **Trims**: list (single trim = card collapses on the consumer side, note it); per trim: names EN/AR, drive, stats overrides, price per market matrix, publish state.
- **Spec ledger** (feeds drawer + compare + model-page tables from ONE source): tab list (e.g. Overview / Battery & charging / Dimensions / Safety) → collapsible groups → rows (key EN/AR · value EN/AR) + optional group note; drag to reorder at every level; "add row/group/tab".
- **Media**: the view-set grid ({model}_{view}: side, front, rear, front-34, rear-34, top, interiors…) showing per-view: render present (from pipeline) or manual upload, resolution check, alt text EN/AR; missing views flagged.
- **Page content**: model-page chapters/blocks editor — ordered blocks (kicker, two-scale headline, body — all EN/AR pairs, image slot from media or approved generated content, layout variant); banner video slot (asset + poster); light-configurator view selection.
- **Preview** button throughout: opens the brand's draft URL for this model.

### 4 · Pipeline (deliveries board)

7-column board: Upload detected → Rendering → Configurator ready → Content generation → Approval → Data fill → Published. Cards = model deliveries (brand, model, version, manifest validation result with exact errors, render progress "files present ÷ expected" with per-variant breakdown, stall badge with age). Card drawer: manifest contents, expected matrix, missing frames list, retry render, jump to approvals/data-fill. Filters: brand, stage, stalled-only.

### 5 · Content Studio (approvals)

Queue view: generated assets awaiting review, grouped by brand/model/trim. Review card: large preview (image/video/copy block incl. AR), provenance (provider, prompt version, cost, seed inputs), actions Approve / Reject (reason) / Regenerate; state machine badges (generated → approved | rejected | regenerating). Copy blocks editable inline before approval (EN/AR). Bulk approve per run. Tab: Runs (history: per run — model, stage, provider, prompt version, asset counts, total cost).

### 6 · Leads

Cross-brand table (time, brand, market, model/trim of interest, type: test-drive/quote/contact/WhatsApp, score, consent version, status) with filters + export. Lead drawer: contact (PII-marked), consent record, full journey timeline (sessions, models viewed, configurator interactions), score breakdown. **Scoring rules editor**: weighted signals (funnel depth, configurator time, return visits…) per brand with live re-score preview. Red banner surface for lead-DLQ (any entry = incident).

### 7 · Analytics

Brand selector (or All = cross-brand operator view). Funnel (showroom → model page → configurator → lead), model/trim engagement ranking, color/option interest, sessions & durations, comparison usage, CTA conversion — date range, market filter, export. "View as tier" preview mode showing exactly which modules each dashboard tier exposes to the brand.

### 8 · Commercial

Tier definition editor (modules matrix per tier — check grid), subscriptions table (brand, tier, term, free-period, status, MRR), invoices across brands, simple revenue overview (MRR, by brand, upcoming renewals).

### 9 · System

- **Vocabulary registry**: the shared option-ID list (colors, interiors, views, body types) — id (lowercase-dash, immutable once used), display names EN/AR, usage count, add/deprecate flow with warning ("IDs are matched character-for-character by the pipeline").
- **Jobs & queues**: job table (kind, state, attempts, age), DLQ viewers (events, leads) with replay, reconciliation reports.
- **Staff & roles**: RBAC matrix (Admin / Ops / Content / Finance / Read-only) per area.
- **Audit log**: filterable trail (actor, action, entity, before/after diff, timestamp).

## Working norms

One page per request; approval between pages. Use realistic seeded data (the BYD catalog: Sealion 05, Sealion 06 DMI, Sealion 06 EV, Dolphin Surf, Atto 08, Shark 6, Ti 7) so screens read true. Every list gets its empty state. Self-verify against this brief's page section before presenting; touch nothing outside the requested page.
