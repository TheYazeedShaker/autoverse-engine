# Build Spec — ENGINE-CORE-1A · REV 2 (Hardening preamble + design reconciliation)

**Context:** the 2026-09-13 status report found the migration structurally complete but carrying security debt, CI gaps, and ops breakage; meanwhile the design phase (consumer + admin + dashboard, all approved-level) produced schema requirements 1·A must include from birth. This revision **prepends Phase 0-H (hardening)** and **amends the 1·A slices**. Original `SPEC-engine-core-1A.md` + theming REV remain in force where not amended.

## Phase 0-H — Hardening (complete ALL before any 1·A slice; one PR per numbered group)

1. **Migrations reconcile:** rename `supabase/migrations/0001_init_tenancy.sql` → `20260617132328_init_tenancy.sql` (contents unchanged); adopt timestamp naming for all future migrations; verify the Supabase GitHub check goes green (DB must be restored first — human action).
2. **Isolation test runs in CI:** wire the `.sql` cross-tenant test into the pipeline (pgTAP or psql runner against the branch DB); CI fails if it fails. This was specced as blocking and has never executed automatically.
3. **RLS security fixes:** (a) profile guard trigger fires on **INSERT and UPDATE** — closes the self-superadmin-at-insert gap; (b) staff write scoping: only roles that need it may write brands/profiles; `read_only` cannot write anything; no role can raise its own role (guard covers staff too); (c) **correct the future-table RLS template** in the migration file AND the `add-rls-policy` skill: brand users read-only on brand-scoped tables, writes only via edge functions (service role) — per CLAUDE.md; (d) move the two `SECURITY DEFINER` helpers into a non-API-exposed schema (do NOT revoke EXECUTE — the advisor's suggestion breaks RLS).
4. **CI gates to full wall:** add secret-scan (also as commit guard), axe a11y for ALL primitives (incl. Container, Grid, Icon, Text), reduced-motion gate, no-hardcoded-tokens lint, plus the isolation job from (2). CI `permissions:` block added.
5. **ADR-0008 obligations + repo hygiene:** widen `.gitignore` (.env variants, key files); **replace real manufacturer names in `packages/types` with fictional ones**; commit `docs/ADMIN-DESIGN-BRIEF.md` (or relocate if the repo-visibility decision moves docs); carry over ADRs 0001, 0003–0007 so references resolve; **flag in Slack and PROGRESS that repo visibility is a pending human decision** — if flipped private, note it in ADR-0008 as superseded.
6. **Finish the loop-proof properly:** add the smoke test post-deploy step and exercise one flag end-to-end (create → off → on → kill) as specced.
7. **Ops closure:** push the old repo's farewell commit (human archives it); fix `packages/types` protocol typing so command/data pairs are discriminated unions (mismatches fail typecheck); update `PROGRESS.md`; wire **Sentry + PostHog** into the consumer scaffold (DSNs via env — human provides).

## 1·A slice amendments (design reconciliation — build these INTO the original slices)

**Slice 1 · Schema additions:**

- **0003 catalog:** models gain `body_type`, `badge_label`, `year`, `efficiency` (label EN/AR, value, icon kind: pump|battery|range), optional `torque`, `order_index` (single ordering: hero adjacency = section order), `publish_state` (draft|ready|published — pattern for models, trims, content, themes). **Options entities** (the configurator's merchandise, admin "Options" tab): `option_assignments` per model — kind (exterior_color|interior_color|wheel|interior_theme), vocabulary_id (FK registry), display EN/AR, swatch (hex or asset ref), order, scope (all-trims | per-trim set). **Spec ledger entities:** `spec_tabs` → `spec_groups` (+note) → `spec_rows` (key EN/AR, scope all-trims with one value EN/AR | per-trim values map); "differs across trims" is derived, never stored. **Page content:** `content_blocks` (model-scoped, ordered, kicker/headline/body EN/AR, layout variant, media ref) + `banner_video` slot per model/trim. Vocabulary registry table (System page): id immutable-once-used, display EN/AR, kind, deprecated flag.
- **0005 assets:** kind enum grows: `sequence_video | banner_video | per_color_render`; per-color renders key on (model_version, trim, color vocabulary_id, view).
- **0006 leads:** capture fields per the consumer form — full_name, phone, city, model/trim of interest, preferred_time; `consent_text_version` + market; **`lead_activities`** (actor, kind: status_change|contact_attempt|note, payload, audit-logged); `score_breakdown` jsonb.
- **0004 control plane:** `tier_modules` matrix (tier ↔ module keys the dashboard gates on); `subscriptions` gains term/renewal/free-period; `invoices` (brand, amount, currency, status, issued/due, pdf asset ref). `brand_markets` config gains: whatsapp_number, lead_routing (emails[], webhook_url), footer_description EN/AR, footer_link_columns jsonb, social_links jsonb (ordered).
- **design-tokens:** add the **admin neutral ramp** (`admin-*`: #101113 sidebar, #0D0E10/#15171A/#1B1D20 dark surfaces + light equivalents) alongside consumer surfaces; both under the pairing invariant test.

**Slice 3/4 (pipelines):** leads edge function accepts the form payload above, validates consent presence, writes lead + consent + first activity transactionally.

## Acceptance additions

- [ ] All Phase 0-H items merged; CI wall = the full CLAUDE.md gate list; isolation test demonstrably ran in CI logs.
- [ ] Schema supports every admin editor shown in the approved designs (Options, ledger scopes, page content, social/footer, tier modules, invoices, lead activities) — reviewed against the design exports, not memory.
- [ ] No real manufacturer names anywhere in the repo outside `docs/` (and `docs/` location per the visibility decision).
- [ ] `PROGRESS.md` current at session end, every session.
