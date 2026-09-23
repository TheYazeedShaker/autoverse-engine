# the Engine — Build Progress

> **Living document.** `CLAUDE.md` holds permanent standards. **This file changes every session** — read at session start, update at session end: fill _What Was Built Last Session_, refresh _Status_, append _Decisions_ / _Known Issues_, rewrite _Next Session — Start Here_ precisely.
>
> **This repository is public** ([ADR-0008](docs/adr/0008-public-repository.md)). Write this file as if a customer will read it: no credentials, no new infrastructure identifiers, nothing said about a vendor or a prospect.

**Last updated:** 2026-09-23
**Last session:** Phase 0-H is complete on the branch chain but **never reached `main`** (PRs #3–#9 merged into each other's branches, not up). PR #10 lands the lot. Then started **ENGINE-CORE-1A** in long-leash mode: one PR per slice, each stacked on the previous so nothing waits on a merge.

---

## THE PLAN (the only one)

**Autoverse** (company) builds **the Engine** (this repo) powering all products. **Phase 1:** the Engine + three apps serving five surfaces — `apps/consumer` (ONE app: Showroom / Brochure / Configurator behind per-brand entitlement gates), `apps/dashboard` (brand, tier-gated), `apps/admin` (operations). One brand, one model, end-to-end, production-hardened, multi-tenant + multi-market in structure. **Phase 2 (separate repo, later):** the Autoverse consumer platform product, built on the Engine's accumulated data. Governing docs in `docs/`; production plan v2.1 wins conflicts.

---

## Status

| Track                             | Status                                                                                                       | Notes                                                                                                                                                                                                                                                             |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ENGINE-MIGRATION`                | ✅ Done 2026-08-12                                                                                           | Spec archived in `specs/archive/`. Loop-proof merged (PR #1) and deployed to production. Two leftovers moved into 0-H: smoke test + flag exercise (0-H.6), old-repo archive (0-H.7).                                                                              |
| **Phase 0-H — Hardening (REV2)**  | ⚠️ **Built, not on `main`**                                                                                  | All 7 groups built and green, but #3–#9 merged into their base branches instead of `main`. **PR #10** lands the whole chain. Until it merges, none of the hardening (RLS fixes, isolation/secrets/smoke jobs, secret-scan hook) protects `main` or the hosted DB. |
| $1 ✅ **Built, gate passed**      | Base spec + theming REV + REV2 amendments all in `specs/`. One PR per slice, stacked on the previous branch. |
| Storybook / design system         | ⏸ Closed at Tier 1                                                                                           | Tier 1 complete (9 primitives). Tier 2 superseded by `SPEC-storybook-tier2` (forthcoming). The three Storybook specs are marked do-not-execute.                                                                                                                   |
| Phase 1·B — Pipeline & admin      | ⏳ Held                                                                                                      | 7-stage board, render orchestration, AI content w/ approval gate.                                                                                                                                                                                                 |
| Phase 1·C — Consumer app          | ⏳ Held                                                                                                      | Design-first.                                                                                                                                                                                                                                                     |
| Phase 1·D — Dashboard & hardening | ⏳ Held                                                                                                      |                                                                                                                                                                                                                                                                   |

### Phase 0-H tracker — all built and green; **on `main` only once PR #10 merges**

| #   | Group                                                                                                             | Status                                                                              |
| --- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| —   | Spec housekeeping (docs only)                                                                                     | ✅ merged to `main` (#2)                                                            |
| 1–7 | Migrations reconcile · isolation in CI · RLS hardening · full CI wall · repo hygiene · smoke + flag · ops closure | ✅ built, green, merged **into branches** (#3–#9) — **PR #10** lands them on `main` |

### Phase 1·A slice tracker (one PR each, stacked)

| Slice | What                                                                             | Status             |
| ----- | -------------------------------------------------------------------------------- | ------------------ |
| setup | Yazeed's answers: `design/` ignored, CLAUDE.md reworded, PROGRESS title repaired | ✅ PR #11          |
| 1     | Schema — catalog and markets                                                     | ✅ PR #12          |
| 2     | Schema — options and spec ledger                                                 | ✅ PR #13          |
| 3     | Schema — control plane and billing                                               | ✅ PR #14          |
| 3.5   | Theming REV — `brand_themes`, `validate-theme`, admin neutral ramp               | ✅ PR #15          |
| 4     | Schema — content blocks and media                                                | ✅ PR #16          |
| 5     | Schema — leads and events                                                        | ✅ PR #17          |
| 6     | Data-access layer (`packages/engine-core`)                                       | ✅ PR #18          |
| 7     | Event pipeline (`ingest-event` + retry worker)                                   | ✅ PR #22          |
| 8     | Leads pipeline (`capture-lead`)                                                  | ✅ PR #19          |
| 9     | Job queue                                                                        | ✅ PR #20          |
| gate  | Induced-failure test, zero-loss reconciliation, evidence to Slack                | ✅ PR #21 — PASSED |

## What Was Built Last Session

**All of ENGINE-CORE-1A: nine slices, the theming REV, and the phase gate — 12 PRs, each CI-green, each stacked on the last so nothing waited on a merge.**

The schema (slices 1–5) enforces in the database what would otherwise be a convention: composite foreign keys make a cross-brand row unrepresentable; a price is a number or "on request", never both; a vocabulary id is frozen once used, even after its last reference is deleted; consent is not optional; events are write-once and activities append-only for everyone, service role included.

Reads only, everywhere. No table added in 1·A has a write policy — writes go through service-role edge functions — and INSERT/UPDATE/DELETE/TRUNCATE are revoked from `anon` and `authenticated`, so denial holds at two layers.

The theming REV puts its AA invariant in CHECK constraints rather than trusting the edge function: the test proves a failing theme cannot be stored even by the service role, with the function bypassed entirely.

The pipelines (7–9) are built around the assumption that they will be interrupted. Ingest never returns 5xx for a bad payload, leads are refused or dead-lettered but never silently dropped, and every job kind is idempotent because a dead worker runs its job again.

**The phase gate passed.** An event and a lead each survived a backend kill mid-write and reconciled to zero loss — including no orphan activity, no routing job for a lead that never existed, and consent intact after the replay.

**Two security reviews caught things worth catching.** The first: a test that passed for the wrong reason, because a unique constraint fired before the foreign key it meant to exercise. The second, and more serious: the public-read policies gated on a model's publish state but not a trim's, so any signed-in account could read the uuid, figures and exclusive options of an unannounced trim through `spec_rows.trim_values` and `option_assignments.trim_ids`. Slice 1 correctly hid the trim's own row, which is what made it easy to miss. Fixed, tested, and merged down the whole stack.

## Decisions Made (must be remembered)

- **Naming:** Autoverse = company; the Engine = engine (this repo); Autoverse = also the Phase-2 platform product (separate repo, later).
- **One consumer app**, three gated surfaces — one journey, one session, one analytics trail; entitlements are flags, not codebases.
- **Transplant, don't rebuild:** design-tokens / ui / types / .claude / CI / migration 0001 carried as-is.
- **Boundary:** the Engine begins at the upload event (3D file + manifest.yaml); studio process never modeled. Manifest = source of truth per model; shared ID vocabulary with the studio, exact spelling.
- **In-house:** Unreal render farm + configurator are Autoverse-side; farm reached only via job queue + scoped bucket key; configurator stays decoupled behind the versioned iframe protocol.
- **Hosting:** StreamPixel for launch; Vagon at Gulf expansion; self-host at sustained scale or when forced by residency/4K/IP.
- **AI content:** conditioning on renders (not fine-tuning); fixed versioned prompts (data, in admin); human approval state machine; brochure renders without AI blocks.
- **Content-gen chain:** renders → image gen (reference-conditioned) → APPROVAL → image-to-video (banner aspects) → approval; copy generated as structured blocks per brand voice profile, EN+AR, same gate. One provider adapter, per-stage swappable; provider picks = ADRs after a bake-off. Asset layout per architecture §07.
- **Design workflow:** design system imported into Claude Design → `CLAUDE-DESIGN-BRIEF.md` / `ADMIN-DESIGN-BRIEF.md` as art direction → co-founder review → approved page returns to chat → locked spec → build.
- Later (documented in place, not dropped): ML scoring, checkout, lead resale (legal+consent), custom domains, per-model fine-tunes, Egypt PDPL counsel check before public launch.
- **Design system:** locked monochrome palette + muted semantic sub-palette (state only); structural contrast pairing + invariant test; Radix; motion restrained/precise with semantic layer + reduced-motion CI gate; Storybook from `packages/ui`; fonts self-hosted (both OFL).
- **Repo visibility:** public per ADR-0008, **but REV2 treats it as a pending decision** — raised in Slack 2026-09-21. If it goes private, mark ADR-0008 superseded.
- **`design/` is Yazeed's** — gitignored; never read, modified or committed by Claude (2026-09-22).
- **Brand/profile writes stay scoped to superadmin + ops** (confirmed 2026-09-22).
- **Migrations use timestamp names from here on** (`YYYYMMDDHHMMSS_name.sql`), matching what the Supabase CLI records remotely (REV2 0-H.1).

## Known Issues / TODOs

### Waiting on Yazeed

- **Repo visibility decision** (keep public / go private).
- **`docs/ADMIN-DESIGN-BRIEF.md`**: it names a real manufacturer + model line as seed data. Commit as-is, genericise that line, or keep it out of the public repo? (0-H.5 is otherwise complete.)
- **Base 1·A spec, theming REV and design exports** — REV2 amends documents that are not in the repo. 1·A cannot start in slice order without them.
- **Sentry DSN and PostHog project key**, set as Vercel env vars (not shared in chat). The code will be a no-op without them.
- **PostHog connector re-authorization** — needed to create and flip the test flag in 0-H.6.
- **Merging each 0-H PR** as it goes green.
- **Archiving the old repo** after its farewell commit is pushed (0-H.7).

### Carried

- Send the studio package (`docs/autoverse-model-delivery-spec.html` + `docs/model-manifest-template.yaml`) and lock the shared ID vocabulary + change process.
- Two documentation portals (internal + client-facing) — Phase 1·D.
- `CLAUDE.md` names a car maker as a quality benchmark ("Porsche-level bar"). REV2's acceptance bans real manufacturer names outside `docs/`. Left untouched because `CLAUDE.md` is the operating manual; Yazeed to decide whether to reword it.

## Next Session — Start Here

**Everything below waits on merges. Nothing is blocked on more building.**

### Merge order (each PR retargets to `main` as the one below it merges)

**#10 first** — it lands all of Phase 0-H, which never reached `main`. Then:
#11 → #12 → #13 → #14 → #15 → #16 → #17 → #18 → (slice 7 branch `feat/1a-s7-event-pipeline`) → #19 → #20 → #21.

### After the merges

1. Confirm the **Supabase check is green on `main`**, and that the 1·A migrations reached the hosted database. Ask before applying anything by hand.
2. Add `isolation`, `secrets` and `phase-gate` to `main`'s required status checks.
3. **Regenerate `packages/engine-core/src/database.types.ts`** from the live schema (command in `supabase/README.md`). It is hand-written until then.
4. **Run the flag kill-path runbook** (`docs/runbooks/flag-kill-path.md`) — still blocked on production having `/api/health`, which arrives with 0-H.
5. Deploy the four edge functions (`validate-theme`, `ingest-event`, `capture-lead`, plus the job worker) and wire a schedule for the worker sweep.

### Open questions for Yazeed (none block 1·A; all are one-line changes)

- **Published-catalogue reads.** Slice 1 asks for both "authenticated reads on published rows" and "brand users read own brand only". I took the stricter reading: a brand user sees its own brand and nothing of a competitor's, and `anon` sees nothing, so the consumer surface must read server-side.
- **`price_egp`** hardcodes a currency in a column name while `brand_markets.currency` is per market. Followed the spec exactly rather than deciding.
- **Asset base kinds.** The slice says the enum "grows" to three new kinds; `source_model | render | image | document` are my assumption about what it grows _from_.
- **`vocabulary_registry` is readable by every signed-in user** — shared reference data, but an option id can carry a brand's wording. Recorded as an accepted risk in the migration header with the condition for tightening it.

### Still not started

Nothing from 1·A remains to build.
