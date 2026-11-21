# Decisions

Every question the merge raised, for the owner. Each has the options and a recommendation (**Rec.**). Nothing here was asked in chat.

The owner's standing decisions (one platform, the Engine admin design wins, the showcase is the consumer base, the admin is ported page by page, the configurator server stays, the dashboard comes after the admin, the repo goes private when the merge is finished) are **not** re-opened.

Where a recommendation would change a spec, an ADR or `CLAUDE.md`, the change is proposed here (D29). The owner makes the spec and `CLAUDE.md` edits; the new ADRs come in PR 0.2.

## Answers (owner, 2026-11-21)

**D1–D29 are decided: the recommendation stands, except where the table below says otherwise.** Each decision below keeps its options for the record. The owner asked for no `#build-decisions` threads.

| Decision | Answer                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1–D9    | As recommended                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| **D10**  | **C.** The owner supplies the designs for Finance, Brochures and Monitoring before their PRs (A19's Monitoring sections, A22, A23, A26). Everything else in §C of `admin-pages.md` is built from the nearest page's components                                                                                                                                                                                                                                            |
| D11, D12 | As recommended                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| **D13**  | **Adopt `accounts`** (as recommended), **but keep the plan names Starter / Growth / Enterprise everywhere.** The names come from `accounts.plans`. The designs' "Standard" and "Professional" are sample copy (rule A), so the built pages show the data's names; the owner updates the approved copies to match                                                                                                                                                          |
| D14–D21  | As recommended                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| **D22**  | **B, interim, until the owner confirms with legal.** Nmesis `ops.leads` and showcase `catalog.bookings` rows stay frozen where they are, readable by staff only through a labelled legacy view. Nothing is migrated into `public.leads` and nothing is deleted; no retention period is set until legal answers. New leads without a consent record keep landing in `ops.leads` until the configurator server's form posts to `capture-lead`, so that change is now urgent |
| D23–D27  | As recommended                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| **D28**  | **Confirmed:** this order replaces the 2026-09-30 order                                                                                                                                                                                                                                                                                                                                                                                                                   |
| D29      | As recommended. The owner edits the specs and `CLAUDE.md`; PR 0.2 adds the ADRs                                                                                                                                                                                                                                                                                                                                                                                           |
| **D30**  | **Open.** Needed before DB-1 (H2)                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **D31**  | **Open.** Needed before the first UI PR's performance gate (A3a)                                                                                                                                                                                                                                                                                                                                                                                                          |

## Platform

### D1 — Which Supabase project is the one

- **A.** The Nmesis project hosts everything. The Engine's 27 migrations are applied there, and the Engine's current project becomes **Preview** (closing BACKLOG #13, ADR 0019 condition 3).
- **B.** The Engine project hosts everything, and the live data moves in: events, leads, invoices, auth users with TOTP.
- **C.** A new third project.

**Rec. A.**

- The live data, staff accounts and the configurator server's writes stay put.
- The Engine side is schema plus a demo tenant.
- No names collide ([`data.md`](data.md) §2).
- B means moving auth users and millions of rows, plus a cutover for the configurator server. C means both.

### D2 — Schema layout

- **A.** Adopt `accounts`, `ops`, `analytics` and `brochures` in place, under Engine migrations: a guarded baseline generated from the live schema, plus Engine RLS policies and isolation tests. Fold the showcase's `catalog` and the Nmesis catalogue files into `public`.
- **B.** Copy everything into `public` and retire the Nmesis schemas.

**Rec. A** (`data.md` §3). B moves PII and millions of rows for no gain, and breaks the configurator server and the AI Studio.

**One exception to record in the ADR.** Adopted tables carry a nullable `brand_uuid` until it is backfilled (DB-5). Rows without one are staff-only in the isolation tests, and the column becomes `not null` at the contract step.

### D3 — The catalogue's source of truth for the configurator server

Today the server reads `brands.json` and one config file per car from the Nmesis repo's data branch, written by the Nmesis admin.

- **A.** Engine tables become the truth. A `publish-config` job writes the same files, in today's exact format and location, on every catalogue publish. The server is unchanged.
- **B.** The server is changed to read the Engine database or an Engine API.
- **C.** The files stay the truth, and the Engine admin edits them through the Nmesis backend.

**Rec. A.**

- One truth (Engine tables, the admin's Catalog), and zero change on the server that "stays where it is".
- B can follow later, as its own project.
- C leaves two catalogues.
- A needs a scoped GitHub write credential for the data branch, held only by the `publish-config` function (D27).

### D4 — Hosting, domains and the background timers

**The admin app.** Rec.: Vercel, like the other two apps, on a new admin host. The old `/admin/*` paths on the configurator server redirect to the new host page by page.

**The timers inside the Nmesis Node process:**

- picture checks every 5 minutes;
- alerts and anomalies every 15 minutes;
- the finance daily run;
- the Cost Explorer refresh;
- model-state auto-resume every 60 seconds.

Options:

- **A.** Move them all to job kinds run by `job-worker` (pg_cron, every minute; ADR 0011).
- **B.** Keep them on the configurator server.
- **C.** Split them.

**Rec. C.**

- Health checks and model-state auto-resume stay on the configurator server (they are about its own pictures and state).
- Finance, alerts, anomalies and costs move to `job-worker` job kinds with their pages.
- Each job starts only when its Nmesis timer is switched off, so no job ever runs on both hosts.

### D5 — Repository privacy, naming and the scope boundary

**(a) What "the merge is finished" means.** It's the trigger for going private. Rec.: the last Nmesis admin page is switched off and its routes return 410 ([`order.md`](order.md), A27).

**(b) Until then, the documents and code name "Nmesis"**, the platform being merged.

- It is already public in `CLAUDE.md` and `packages/types`.
- They never name a car brand, a model, a client, a dealer or a partner.
- They never describe how a live system could be attacked; such findings go to the owner privately.
- Ported code must strip the showcase's hard-coded brand (about 20 places, listed in the port PRs).
- If "Nmesis" itself should not be named in a public repo, say so, and these files will use "the studio platform".

**(c) When the repo goes private**, the owner marks ADR 0008 superseded. Rec.: keep the "no real names outside `docs/`" rule anyway; it costs nothing.

**(d) The scope boundary.** `CLAUDE.md` says nothing upstream of the upload event at Nmesis is modeled here. The merge models the Nmesis admin, its catalogue and its configurator settings, so the boundary needs rewording. The proposed wording is in D29.

## Auth and roles

### D6 — Staff sign-in

**What Nmesis staff have today:** Supabase Auth in the Nmesis project, with password, emailed link or Google sign-in, **mandatory TOTP**, and an emergency fallback login.

Options:

- **A.** The Engine admin uses the same Supabase Auth, through SSR cookies. Staff keep their passwords and factors. The emergency fallback is retired.
- **B.** Fresh Engine accounts by invite.

**Rec. A.** It's free once D1 is A.

**aal2 is enforced in two places:**

- **on every route,** by the admin app;
- **in the database:** `app_auth.is_autoverse_staff()` and every staff helper require `auth.jwt()->>'aal' = 'aal2'`.

A password-only token therefore passes no staff policy, even when it is used directly against PostgREST. DB-1 and DB-2 carry this, with a test that an aal1 staff token is refused everywhere. The edge functions' staff check requires aal2 too (ADR 0032).

The emergency fallback becomes a documented owner-only procedure in the Supabase dashboard.

### D7 — One staff role model

The role sets disagree:

| Source                     | Roles                                                                                                                                          |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Engine enum                | `superadmin`, `ops`, `content_editor`, `support`, `read_only`                                                                                  |
| Admin spec                 | superadmin, ops, content, **finance**, read_only                                                                                               |
| Nmesis `accounts.staff`    | owner, ops, sales, finance, viewer, over ten areas                                                                                             |
| The approved System design | Ops admin, Content lead, Catalog editor, Legal, Dealer agent, Partner viewer, each with a scope (brand, market, module) and the sign-offs held |

**Rec.:**

- **The roles:** `superadmin` (= owner), `ops`, `finance`, `sales`, `content_editor`, `read_only`. Keep `support` until it is shown unused, then drop it.
- **Mapping existing staff:** owner → superadmin, ops → ops, sales → sales, finance → finance, viewer → read_only.
- **Per-area permissions** (Nmesis's ten areas) become a server-side table of role × area. Every action declares its area, so a route shared by two areas can't widen either. Tested per action.
- **Later**, with Pipeline: scope (brand, market) and sign-off roles (Legal, Pricing), when the sign-off policies are built (D11).
- **Dealer agents and partner viewers** are not staff. They are a later brand-side role.

### D8 — How staff writes reach tables, and deletes

The Engine pattern is no browser writes and service-role edge functions. The admin spec wants writes under the staff session with RLS.

- **A.** Staff-write RLS policies per table, with table DML granted to `authenticated`.
- **B.** One edge function per mutation, holding the service role.
- **C.** One `admin-mutate` function over a typed registry. It validates with Zod, rate-limits and checks the role and area, then calls a **role-checked SECURITY DEFINER RPC** per resource under the user's JWT. **No table DML is granted to `authenticated`.**

**Rec. C, with B for privileged work.** Theme validation, key issuing, publishing, money, staff administration and frame keys get their own functions.

- C keeps "browsers never write tables": a staff token used directly against PostgREST can write only through the RPCs, and each RPC checks aal2, role, area, its arguments and a rate limit itself (ADR 0032).
- The RPCs check aal2, role and area themselves, and the audit triggers record every write (D9).
- The pattern (helpers, soft-delete columns, the first RPCs) lands in its own DB PR (A4a). Each page's DB PR adds its resource's RPCs.

**Deletes:**

- Soft for 30 days (today's recycle bin), then purged by a job.
- **A brand or model that has leads or invoices is never purged:** it is archived. Purging would cascade into `leads` and `lead_activities`, and leads and invoices are never deleted.

### D9 — One audit log

**Rec.:**

- Adopt `ops.audit_log`, which keeps its history. Add `actor_id`, `entity_type`, `entity_id`, `before`, `after` and `trace_id`, make it append-only, and write it from DB triggers on every audited table.
- The admin's "Audit trail" links and the System page read it.
- The alternative is a fresh `public.audit_entries`; it loses the Nmesis history or needs a copy.

## Admin

### D10 — Nmesis features with no approved design

The 16 feature groups listed in [`admin-pages.md`](admin-pages.md) §C, from staff sign-in to the catalogue fields the showcase needs.

**Options:**

- **A.** Build each as a tab or section of its nearest designed page, from that page's own components (tables, tabs, forms, KPI cards), and note it in the PR.
- **B.** Ask for a design for each before building.
- **C.** A, except for the three with real design weight (Finance, Brochures and the Monitoring/costs views), where a design is requested first.

**Rec. C.**

**Decided (owner, 2026-11-21): C.** The owner supplies the Finance, Brochures and Monitoring designs before their PRs.

### D11 — Approved designs with no feature yet

**The designs:**

- Pipeline (sign-off queue, render deliveries);
- Content (campaigns, homepage composition, generated-content review, translation coverage);
- Commercial (finance offers, partners, price-change sign-offs, dealer agreements, lead-form experiment);
- Leads' dealer routing and SLA;
- System's integration health and sign-off policies;
- Analytics' campaign attribution;
- Catalog's spec-sheet AI import.

**Options:**

- **A.** Build them now, behind flags, with empty states.
- **B.** Build them when their data exists: Pipeline and Content after the 1·B pipeline; Commercial offers and dealers when a brand asks.

**Rec. B.** Ship each page's shell with only the sections that have data. Hidden sections stay out of the bundle. This keeps the Phase-2 split in `SPEC-app-admin-portal.md`.

### D12 — One lead model

| Source             | Types                                 | Statuses                                                             |
| ------------------ | ------------------------------------- | -------------------------------------------------------------------- |
| Engine enum        | test_drive, quote, contact, whatsapp  | new, contacted, qualified, won, lost                                 |
| Nmesis `ops.leads` | test_drive, build_price               | new, contacted, booked, closed                                       |
| Showcase bookings  | reserve, test_drive, interest         | new, contacted, booked, closed                                       |
| Admin Leads design | test drive, quote, waitlist, trade-in | new, contacted, qualified, visited showroom, nurture, closed (+ SLA) |
| Dashboard design   | test drive, quote, contact, whatsapp  | new, contacted, scheduled, closed (+ score)                          |

**Rec.:**

- **Types:** test_drive, quote, contact, whatsapp, reserve, interest. Mapping: build_price → quote; waitlist = interest; trade-in waits for a feature.
- **Statuses:** new, contacted, scheduled, qualified, won, lost, closed. Mapping: booked → scheduled; visited showroom → qualified; nurture is a tag, not a status.
- **Both portals show the same words.** Each design's labels map onto these; the design wins on wording, the data wins on states.
- **New columns:** `email`, `reference`, `configuration`, `source`. The preferred date goes in the existing `preferred_time`.
- **BACKLOG #17** (the stale `LeadType` in `packages/types`) is folded into the same PR.

### D13 — The commercial model

The tenant shapes and plan names disagree:

- **Tenant shape.** Nmesis bills an **organisation** that owns brands. The Engine bills a **brand**.
- **Plan names:**
  - Nmesis: Starter / Growth / Enterprise, plus custom plans, with 41 features over 6 products;
  - admin design: Starter / Standard / Enterprise;
  - dashboard design: Starter / Professional / Enterprise;
  - Engine: free / tier1–3.

**Rec.:**

- **Adopt `accounts` as the commercial model.** An organisation owns brands; plans and features drive the dashboard's tier gates through `accounts.entitlements()`.
- **Retire the Engine's empty commercial tables:** `public.subscriptions`, `public.invoices` and `public.tier_modules`.
- **Plan names:** the owner picks one set for all three places. Rec.: the designs' "Starter / Professional / Enterprise", with Growth renamed to Professional. The admin design's "Standard" is a sample-copy slip.

**Decided (owner, 2026-11-21): adopt `accounts`, but keep Starter / Growth / Enterprise everywhere.** The names come from `accounts.plans`; the designs' labels are sample copy and the owner updates the approved copies to match.

### D14 — The switch-off rule per page

- **A.** **Freeze then switch.**
  - The Engine page ships behind its flag, **read-only**, and reads the same data (synced). The Nmesis page stays the only writer.
  - After a hold period, the Engine page becomes the writer and the Nmesis page's writes are refused.
  - After a second hold, the Nmesis route redirects.
- **B.** A hard cutover per page.

**Rec. A.**

- The hold is 5 working days per page; 10 for Finance.
- The switch-off point for each page is marked in `order.md`.

## Consumer

### D15 — The showroom hero

- **A.** Keep the Engine's built carousel hero (the approved design) as the default. Add the showcase's scroll-scrubbed frame hero as an optional per-brand hero when the brand has a hero sequence, lazy and outside LCP.
- **B.** Replace the carousel with the scrub hero.
- **C.** Drop the scrub hero.

**Rec. A.**

### D16 — Which brochure

The approved `brochure.dc.html` is the showcase's brochure **v1**. The showcase's newer **v3 template** (contract 1: one design per brand, one data file per model) has no approved copy in `design-approved/`.

- **A.** v3 becomes the brochure. The owner copies its approved design (the brochure proof) into `design-approved/brochure/`, and `SPEC-page-consumer-brochure.md` is amended to point at it.
- **B.** v1, the approved design, as the spec says. v3 is dropped.
- **C.** Both, per brand.

**Rec. A.** It is the owner's latest work, it is data-driven and multi-model by construction, and it is the only i18n-ready piece of the showcase.

### D17 — The configurator page's modes

The spec says a pixel-streaming session through a provider-agnostic edge function (StreamPixel at launch). The showcase has View and Build (the image-sequence engine) and an "Enhanced" mode that iframes a URL.

- **A.** View and Build use the ported engine. **Enhanced** iframes the configurator server, which stays where it is. The streaming-session edge function is deferred until a brand needs pixel streaming.
- **B.** Build the spec's streaming session now as well.

**Rec. A.** Amend `SPEC-page-consumer-configurator.md` (D29). The provider-agnostic session layer stays the plan for streaming.

### D18 — Where the configurator engine lives

- **A.** A new workspace package, `packages/configurator`: client-only, strict TS, its own tests. Its pure parts (manifest normaliser, pricing, availability, swatches, the brochure's trims-and-colours rule) go in `engine-core`.
- **B.** Inside `apps/consumer/lib/configurator`.
- **C.** All of it in `engine-core`.

**Rec. A.**

- Three places use it: the consumer pages, the embed route, and the admin's "Preview draft".
- `engine-core` is also used on the server and must stay free of canvas and WebGL.
- Needs an ADR (`CLAUDE.md`'s repo structure gains a line).

### D19 — One configurator protocol

The Engine's `ConfiguratorCommand` (`packages/types`, `source: "autoverse"`, `version: "1"`; the production plan calls it v1.1) and the showcase's `nmesis:*` embed messages differ.

- **A.** The wire stays `nmesis:*`, for compatibility with every embed. The Engine's typed protocol is mapped onto it by an adapter in `packages/types`, with a contract test (the merge wall's contract gate).
- **B.** Move every embed to the Engine protocol.

**Rec. A.** Record the mapping as the next protocol version in an ADR.

### D20 — URL compatibility

| Showcase URL                                   | Engine URL             |
| ---------------------------------------------- | ---------------------- |
| `/configurator?model=…`                        | `/configure/[model]?…` |
| `/brochure/<model>` and `/brochure-v3/<model>` | `/models/[model]`      |
| `/compare?a=&b=`                               | `/compare?trims=`      |
| `/embed/<brand>/<model>`                       | unchanged              |

**Rec.:** permanent redirects that keep the query, through a mapping table, for the showcase's host only. The showcase was a private demo, so no public link depends on it; the redirects are a courtesy to the demo's users.

### D21 — Private demos before a brand launches

The showcase is a private demo behind a site-wide gate.

- **A.** No gate in the consumer app. Pre-launch brands stay behind their flags and `brand_markets.live = false`. Previews go to named people through Vercel deployment protection.
- **B.** A per-brand-market preview password checked in the proxy (a new secret per brand; a security review).
- **C.** Signed, expiring preview links issued from the admin.

**Rec. C for later, A now.** C needs a security review and its own PR. A works today.

### D22 — Leads and bookings that carry no consent record (HUMAN ONLY)

Nmesis `ops.leads` and showcase `catalog.bookings` hold names, phones and emails without a consent-text version. Engine leads require one (ADR 0025).

The options are listed for the owner's legal answer only:

- **A.** Migrate them with a marker version that says "pre-consent-record, legacy".
- **B.** Leave them frozen in their tables, readable by staff only, and delete them after a retention period.
- **C.** Migrate only those that later give consent.

**No recommendation: this is legal text and policy, and it is the owner's.**

**Decided (owner, 2026-11-21): B, interim, until the owner confirms with legal.** The rows stay frozen and staff-read only; nothing is deleted and no retention period is set yet.

### D23 — Two brochure systems become one

The Nmesis admin has its own brochure tool: the `brochures` schema (brand pages, templates, per-car drafts and published snapshots), AI generation and server rendering of public brochure pages. The showcase has the v3 template.

- **A.** One brochure model in the Engine. The v3 contract becomes a versioned `brochure_layouts` document per model and market (Zod, EN/AR); facts come from Engine tables. The Nmesis tool's published snapshots are kept read-only until each brand's brochure is re-published through the new model.
- **B.** Keep both.

**Rec. A.** The Nmesis tool's AI generation becomes Content → Generated content (the approved design), with the human approval gate the plan requires.

## Data

### D24 — Configurator analytics

- **A.** `analytics.events` stays the configurator's raw store, written by the configurator server. The admin and dashboard read rollups through role-checked functions. The journey events from the consumer app go to `public.events` (slice 9). One rollup view joins both by `brand_uuid`.
- **B.** Copy the history into `public.events` and move the server to `ingest-event` now.

**Rec. A now, B as a later project.**

### D25 — Slugs and the crosswalk

**Rec.:**

- Engine slugs start equal to the Nmesis slugs.
- A `legacy_ids` table maps every Nmesis and showcase key (brand, model, trim, colour, interior, CDN prefix) to Engine ids.
- `ops.frame_keys` keeps its original strings forever: the configurator server depends on them exactly.

### D26 — Catalogue gaps the showcase and Nmesis need

None of these exist in the Engine:

- option prices (paid colours);
- a price history;
- stock;
- selectable / not-selectable with a reason;
- the `package` option kind, which also widens the `option_assignments_kind_is_option` CHECK;
- a coming-soon sale status;
- the Enhanced URL;
- a per-model asset base path;
- `swatch_hex_2` (two-tone);
- fuel per trim (`trims.drive` and the fuel/drive vocabulary kinds already exist).

Each needs a column or table (`data.md` §5.7).

- **Rec.:** add them in DB-5.
- **Stock** is demo data today, so the table ships empty. Confirm a real stock feed is wanted before building its admin UI.

### D27 — Secrets and keys during the move

**Rec.:**

- **Before anything:** pin the admin session and signed-link secrets on the Nmesis host (H1). The exact steps were given to the owner privately.
- **No key is rotated during the merge.**
- **`FRAME_MASTER_KEY` stays only on the configurator server.**
- **The `frame-keys` function** asks that server to issue a key. It never holds the master key itself.
- **`publish-config`** gets its own GitHub credential, scoped to writing the data branch and held only by that function.
- **Per-product API keys** keep working until the AI Studio reads entitlements another way.

## Process

### D28 — The order relative to the consumer pages

The 2026-09-30 order said: the consumer pages (showroom slices 9–10, then brochure, compare, configurator, footer), then the admin. This task asks for the admin's foundations first.

**Rec.:**

- **Track A:** admin foundations and the Nmesis pages in value order.
- **Track B, alongside it:** showroom slice 9 (event capture, consent B), because the dashboard depends on it.
- **Track C (the showcase port):** its packages (C1–C2) can start after 0.2; its pages (C3 on) come after the admin's Catalog I, which feeds them.

**Decided (owner, 2026-11-21): confirmed.** This replaces the 2026-09-30 order.

### D29 — Spec, ADR and `CLAUDE.md` changes for the owner

**Specs:**

1. **`SPEC-app-admin-portal.md`:**
   - Phase 1 becomes the Nmesis port order in `order.md`;
   - the role list follows D7;
   - "every write audited" names `ops.audit_log` (D9);
   - the write path is D8's (role-checked RPCs under the staff JWT, no table DML);
   - aal2 is required for staff (D6).
2. **`SPEC-app-brand-dashboard.md`:** tier gating reads `accounts.entitlements()` instead of `tier_modules` (D13).
3. **`SPEC-page-consumer-configurator.md`:** View/Build/Enhanced per D17; the streaming session deferred.
4. **`SPEC-page-consumer-brochure.md`:** the design source per D16; the data model per D23.
5. **`SPEC-page-consumer-compare.md`:** the linked viewers and the redirect from `?a=&b=` (D20).

**ADRs:**

6. **New ADRs:**
   - one database (D1, D2, including the nullable `brand_uuid` exception);
   - `packages/configurator` (D18);
   - the next protocol version (D19);
   - catalogue publishing to the configurator server (D3);
   - the audit log (D9);
   - staff auth, roles and the write path (D6, D7, D8).
7. **ADR 0008** superseded when private (D5). **ADR 0019** superseded once Preview has its own project (D1).

**`CLAUDE.md`:**

8. **"What this is" and the scope boundary.** Proposed wording:
   > The Engine also hosts the Nmesis platform's admin, catalogue and configurator settings. It never models studio production work: that begins and ends before the upload event.
9. **"Commercial model":** tiers come from the adopted plans and features (D13).
10. **The repo structure** gains `packages/configurator`.

### D30 — The AI Studio

It shares the project and `accounts`, and owns objects no repo shows (for example, a support-access function).

**Rec.:**

- The owner lists the Studio's database objects before DB-1 (H2).
- The baseline declares them, or explicitly leaves them alone.
- The Studio's contract (`entitlements()`, `members`, `usage_ledger`, `cars`) is kept by tests.
- Folding the Studio into the monorepo is out of scope.

**Status (2026-11-21): open.**

### D31 — Performance ceilings per route

Production plan §15 says "fixed ceiling per route" without a number.

**Rec.** Initial JS, gzipped, excluding lazy heavy embeds:

| Route            | Ceiling |
| ---------------- | ------- |
| showroom         | 180 KB  |
| brochure         | 200 KB  |
| configurator     | 160 KB  |
| compare          | 160 KB  |
| embed            | 120 KB  |
| each admin route | 300 KB  |

Enforced in CI with a bundle check. The owner confirms or sets the numbers.

**Status (2026-11-21): open.**
