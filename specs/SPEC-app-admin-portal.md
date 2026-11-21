# Build Spec — Admin Portal (operator app)

**Task ID:** `APP-ADMIN-PORTAL`
**Depends on:** the merge map (`docs/merge-map/`) and ADRs 0027–0032; the one-database steps H1–H4 (`docs/runbooks/one-database.md`). `apps/admin` scaffold exists.
**Design source (read-only):** `design-approved/admin/*.dc.html` (owner copies them in, neutral names).
**Standing rules:** the approved design wins on visuals (rule A); visual self-check before each UI PR (rule B); at most 2–3 PRs per phase part (rule C).

## Approach: schema-driven, not hand-built

Most admin screens are lists and edit forms over tables that already exist. Build them from **one resource registry** instead of screen by screen:

- A typed registry entry per resource (table): list columns, filters, search, detail fields, edit form fields (with Zod validation generated from the DB types), EN/AR field pairs, publish-state control, and which role and area may read/write it.
- Generic `ResourceList`, `ResourceDetail` and `ResourceForm` screens render any registry entry in the approved admin style (neutral greyscale, dual theme, dense tables, sticky headers).
- Custom screens only where the design needs more than a list/form (listed below).

## Security (non-negotiable)

- **Staff sign-in** (Supabase Auth): the same accounts and factors staff use today, through SSR cookies. **aal2 (TOTP) is required for staff** (D6, ADR 0032): on every route, in every staff database helper and in the edge functions' staff check. An aal1 session (any sign-in without TOTP: password, emailed link or Google) reaches nothing.
- **Roles** from `profiles.platform_role`: superadmin, ops, finance, sales, content_editor, read_only (D7); `support` stays until it is shown unused (ADR 0032). Every action also declares its area; a server-side role × area table decides. Every route and action checks the role and the area server-side.
- **Reads** run with the signed-in staff user's session, so RLS applies.
- **Writes go through role-checked RPCs under the staff JWT** (D8, ADR 0032). The `admin-mutate` function validates with Zod, rate-limits and checks the role and area, then calls a SECURITY DEFINER RPC per resource. Each RPC checks aal2, the role, the area, its arguments and a rate limit itself. **No table DML is granted to `authenticated`.**
- No service-role key in the admin app. Privileged work (theme validation, key issuing, publishing, asset registration, money, staff administration, frame keys) goes through dedicated edge functions that check aal2, the role and the area themselves (`requireStaff`, ADR 0032).
- **Every write is audit-logged in `ops.audit_log`** by database triggers: actor, entity, before/after per the table's allow-list (personal data only as "changed"), trace id; append-only (D9, ADR 0031). Destructive actions confirm inline.
- **Deletes are soft** for 30 days, then purged by a job. A brand or model with leads or invoices is archived, never purged (D8).
- Isolation: a staff user scoped to one brand (if introduced later) can never see another's rows; add to the isolation test when roles gain brand scope.

## Phase 1: the Nmesis admin's port, page by page

Phase 1 follows the port order in `docs/merge-map/order.md` (track A). The foundations come first: the baseline, staff identity and audit, staff auth, the shell, the write pattern and the read wrappers (A1–A5). Each page's database and function PRs come first, on their own. The page-by-page map is `docs/merge-map/admin-pages.md`. Each Nmesis page hands over by the switch-off rule (D14).

1. **Shell + auth + Overview** (A3a, A3b, A6): the approved shell (sidebar, top bar, theme toggle), sign-in with TOTP, the role and area guard; Overview KPIs, alerts (dead-letter alerts included) and recent activity.
2. **System** (A7a, A7b): staff and roles (invite, switch off, TOTP reset), the audit trail with export, the vocabulary registry, jobs and DLQ status.
3. **Leads** (A8, A9): cross-brand inbox with filters and audited export; lead detail with a masked phone and audited reveal, the activity log and status changes (append-only activities); the dead-letter view with replay; the legacy leads, read-only, in their own labelled tab (D22).
4. **Catalog** (A10–A13): models, trims, prices per market, options (vocabulary pickers, per-trim scope), spec ledger (tabs → groups → rows, per-trim scope, drag order), media (assets per trim/view, missing-view flags; uploads follow ADR 0022 via an upload function that normalises and hashes), content blocks, publish state, and the configurator settings, published by `publish-config` (ADR 0030).
5. **Brands** (A15–A17): list + detail tabs from the design: profile & markets, theme (via `validate-theme`, AA errors shown by pair), logos (via the logo tool's rules), CTAs/contact/footer/social, publishable keys (issue/revoke via a function), consent texts (append-only: add a new version, never edit), surfaces and plan.
6. **Settings, Monitoring and Analytics** (A18–A19b): alert settings and recipients, frame keys through a function, cross-brand analytics.
7. **Plans and Finance** (A20–A23): plans and the price book; revenue, clients, invoices, costs and renewals.
8. **Brochures** (A24–A26).

Finance, Brochures and Monitoring wait for their approved designs (D10).

## Phase 2

Pipeline board and Content approvals (need the 1·B pipeline; D11), spec-sheet AI import with review.

## Acceptance (per phase)

- [ ] Every Phase-1 screen matches the design (rule B: both screenshot sets shown in the chat, a text-only note on the PR).
- [ ] A read_only user can't write anything; role and area tests per action.
- [ ] An aal1 staff token (any sign-in without TOTP) is refused on every route, RPC and function.
- [ ] `authenticated` has no table DML; a staff token used directly against the database writes only through the RPCs.
- [ ] Every write appears in `ops.audit_log` with before/after, per the table's allow-list (ADR 0031).
- [ ] No service-role key in the admin bundle, env or responses.
- [ ] Creating a second demo brand end to end through the portal (brand → theme → logo → model → trim → price → publish) makes it appear on the showroom with no SQL.
