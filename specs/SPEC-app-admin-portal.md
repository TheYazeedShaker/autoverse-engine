# Build Spec — Admin Portal (operator app)

**Task ID:** `APP-ADMIN-PORTAL`
**Depends on:** the consumer pages (their schema is the data this portal edits). `apps/admin` scaffold exists.
**Design source (read-only):** `design-approved/admin/*.dc.html` (owner copies them in, neutral names).
**Standing rules:** the approved design wins on visuals (rule A); visual self-check before each UI PR (rule B); at most 2–3 PRs per phase part (rule C).

## Approach: schema-driven, not hand-built

Most admin screens are lists and edit forms over tables that already exist. Build them from **one resource registry** instead of screen by screen:

- A typed registry entry per resource (table): list columns, filters, search, detail fields, edit form fields (with Zod validation generated from the DB types), EN/AR field pairs, publish-state control, and which role may read/write it.
- Generic `ResourceList`, `ResourceDetail` and `ResourceForm` screens render any registry entry in the approved admin style (neutral greyscale, dual theme, dense tables, sticky headers).
- Custom screens only where the design needs more than a list/form (listed below).

## Security (non-negotiable)

- Staff sign-in (Supabase Auth); roles from `profiles` (superadmin, ops, content, finance, read_only). Every route and action checks the role server-side.
- All reads and writes run with the **signed-in staff user's session**, so RLS applies. No service-role key in the admin app. Operations that need elevated rights (theme validation, publishing, key issuing, asset registration) go through dedicated edge functions that check the staff role themselves.
- Every write is audit-logged (actor, entity, before/after). Destructive actions confirm inline.
- Isolation: a staff user scoped to one brand (if introduced later) can never see another's rows; add to the isolation test when roles gain brand scope.

## Phase 1 (build first, needed for the demo and first brand)

1. **Shell + auth + Overview:** the approved shell (sidebar, top bar, theme toggle), sign-in, role guard; Overview KPIs from existing tables (leads today, published models, dead-letter alerts).
2. **Brands:** list + detail tabs from the design: profile & markets, theme (via `validate-theme`, AA errors shown by pair), logos (via the logo tool's rules), CTAs/contact/footer/social, publishable keys (issue/revoke via a function), consent texts (append-only: add a new version, never edit).
3. **Catalog:** models, trims, prices per market, options (vocabulary pickers, per-trim scope), spec ledger (tabs → groups → rows, per-trim scope, drag order), media (assets per trim/view, missing-view flags; uploads follow ADR 0022 via an upload function that normalises and hashes), content blocks, publish state.
4. **Leads:** cross-brand list with filters and export, lead detail with activity log and status changes (append-only activities), dead-letter view with replay.
5. **System:** vocabulary registry, staff & roles, audit log viewer, jobs/DLQ status.

## Phase 2 (after the dashboard's Phase 1)

Analytics (cross-brand), Commercial (tiers/modules, subscriptions, invoices), Pipeline board and Content approvals (need the 1·B pipeline), spec-sheet AI import with review.

## Acceptance (per phase)

- [ ] Every Phase-1 screen matches the design (visual self-check attached).
- [ ] A read_only user can't write anything; role tests per resource.
- [ ] Every write appears in the audit log with before/after.
- [ ] No service-role key in the admin bundle, env or responses.
- [ ] Creating a second demo brand end to end through the portal (brand → theme → logo → model → trim → price → publish) makes it appear on the showroom with no SQL.
