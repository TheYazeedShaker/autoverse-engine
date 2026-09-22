# the Engine — Build Progress

> **Living document.** `CLAUDE.md` holds permanent standards. **This file changes every session** — read at session start, update at session end: fill _What Was Built Last Session_, refresh _Status_, append _Decisions_ / _Known Issues_, rewrite _Next Session — Start Here_ precisely.
>
> **This repository is public** ([ADR-0008](docs/adr/0008-public-repository.md)). Write this file as if a customer will read it: no credentials, no new infrastructure identifiers, nothing said about a vendor or a prospect.

**Last updated:** 2026-09-22
**Last session:** Phase 0-H is complete on the branch chain but **never reached `main`** (PRs #3–#9 merged into each other's branches, not up). PR #10 lands the lot. Then started **ENGINE-CORE-1A** in long-leash mode: one PR per slice, each stacked on the previous so nothing waits on a merge.

---

## THE PLAN (the only one)

**Autoverse** (company) builds **the Engine** (this repo) powering all products. **Phase 1:** the Engine + three apps serving five surfaces — `apps/consumer` (ONE app: Showroom / Brochure / Configurator behind per-brand entitlement gates), `apps/dashboard` (brand, tier-gated), `apps/admin` (operations). One brand, one model, end-to-end, production-hardened, multi-tenant + multi-market in structure. **Phase 2 (separate repo, later):** the Autoverse consumer platform product, built on the Engine's accumulated data. Governing docs in `docs/`; production plan v2.1 wins conflicts.

---

## Status

| Track                             | Status                      | Notes                                                                                                                                                                                                                                                             |
| --------------------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ENGINE-MIGRATION`                | ✅ Done 2026-08-12          | Spec archived in `specs/archive/`. Loop-proof merged (PR #1) and deployed to production. Two leftovers moved into 0-H: smoke test + flag exercise (0-H.6), old-repo archive (0-H.7).                                                                              |
| **Phase 0-H — Hardening (REV2)**  | ⚠️ **Built, not on `main`** | All 7 groups built and green, but #3–#9 merged into their base branches instead of `main`. **PR #10** lands the whole chain. Until it merges, none of the hardening (RLS fixes, isolation/secrets/smoke jobs, secret-scan hook) protects `main` or the hosted DB. |
| Phase 1·A — Engine core           | 🔨 **In progress**          | Base spec + theming REV + REV2 amendments all in `specs/`. One PR per slice, stacked on the previous branch.                                                                                                                                                      |
| Storybook / design system         | ⏸ Closed at Tier 1          | Tier 1 complete (9 primitives). Tier 2 superseded by `SPEC-storybook-tier2` (forthcoming). The three Storybook specs are marked do-not-execute.                                                                                                                   |
| Phase 1·B — Pipeline & admin      | ⏳ Held                     | 7-stage board, render orchestration, AI content w/ approval gate.                                                                                                                                                                                                 |
| Phase 1·C — Consumer app          | ⏳ Held                     | Design-first.                                                                                                                                                                                                                                                     |
| Phase 1·D — Dashboard & hardening | ⏳ Held                     |                                                                                                                                                                                                                                                                   |

### Phase 0-H tracker — all built and green; **on `main` only once PR #10 merges**

| #   | Group                                                                                                             | Status                                                                              |
| --- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| —   | Spec housekeeping (docs only)                                                                                     | ✅ merged to `main` (#2)                                                            |
| 1–7 | Migrations reconcile · isolation in CI · RLS hardening · full CI wall · repo hygiene · smoke + flag · ops closure | ✅ built, green, merged **into branches** (#3–#9) — **PR #10** lands them on `main` |

### Phase 1·A slice tracker (one PR each, stacked)

| Slice | What                                                                             | Status |
| ----- | -------------------------------------------------------------------------------- | ------ |
| setup | Yazeed's answers: `design/` ignored, CLAUDE.md reworded, PROGRESS title repaired | 🔨 PR  |
| 1     | Schema — catalog and markets                                                     | 🔨 PR  |
| 2     | Schema — options and spec ledger                                                 | 🔨 PR  |
| 3     | Schema — control plane and billing                                               | 🔨 PR  |
| 3.5   | Theming REV — `brand_themes`, `validate-theme`, admin neutral ramp               | 🔨 PR  |
| 4     | Schema — content blocks and media                                                | ⏳     |
| 5     | Schema — leads and events                                                        | ⏳     |
| 6     | Data-access layer (`packages/engine-core`)                                       | ⏳     |
| 7     | Event pipeline (`ingest-event` + retry worker)                                   | ⏳     |
| 8     | Leads pipeline (`capture-lead`)                                                  | ⏳     |
| 9     | Job queue                                                                        | ⏳     |
| gate  | Induced-failure test, zero-loss reconciliation, evidence to Slack                | ⏳     |

## What Was Built Last Session

- **Spec housekeeping.** `SPEC-engine-migration.md` moved to `specs/archive/` with a `COMPLETED 2026-08-12` header. The three Storybook specs carry a header closing them at Tier 1. The REV2 spec is committed to `specs/`.
- **0-H.1 — migration renamed** to `20260617132328_init_tenancy.sql` (contents byte-identical) so it matches the version the remote DB recorded. Timestamp naming documented in `supabase/README.md`; the skill, the `security-review` agent and the isolation test now point at the new name. The Supabase check can only go green on `main` after merge.
- **0-H.2 — isolation test runs in CI.** New `isolation` job: `supabase db start` boots a throwaway Supabase Postgres (real roles + `auth` schema), applies every migration, and runs every `supabase/tests/*.test.sql` with `psql -v ON_ERROR_STOP=1`. A canary step switches RLS off and requires the test to fail, proving it can still see a leak. No hosted DB, no secrets. Deliberate deviation from the spec's "against the branch DB": a fresh local database is deterministic, free, and needs no credentials on a public repo.
- **0-H.3 — RLS hardening** (`20260921151103_rls_hardening.sql` + `0002_rls_hardening.test.sql`). Guard now fires on INSERT/UPDATE/DELETE; only superadmin + ops write brands/profiles; nobody changes their own role; only a superadmin grants/revokes/touches superadmin; helpers moved to the non-exposed `app_auth` schema; the future-table pattern is now read-only for brand users. The guard explicitly trusts no-JWT (migrations/SQL editor) and service-role contexts — otherwise extending it to INSERT would have locked edge functions out of provisioning.
- **0-H.3 follow-up (security review: APPROVE with conditions, all addressed).** Guard trust now comes from the connection (`session_user` + the `role` setting), not from JWT presence — the old "no claims = trusted" rule would have trusted GoTrue's sign-up trigger, reopening the self-superadmin gap. Superadmin rows are off-limits to non-superadmins entirely; managers can't delete/re-create their own profile. Every negative test asserts the error message; a second CI canary removes the guard and requires the test to fail with a CRITICAL finding.
- **0-H.4 — CI wall.** Secret scan: `.claude/hooks/secret-scan.sh` rewritten (it exited 1, which Claude Code never treats as a block; now exits 2, fails closed, blocks `.env`/key files, wider patterns) and wired as a real git **pre-commit** hook (`.githooks/`, enabled by `pnpm install`); CI `secrets` job runs gitleaks over the full history. axe on all 9 primitives (the 4 missing ones added, in LTR **and** RTL). Reduced-motion: Button/SegmentedToggle/Swatch now honour it, and a gate test fails CI on any animating class without its `motion-reduce:` counterpart (plus CSS / motion-library checks; the gate self-tests its detector). No-hardcoded-tokens lint: hex, colour functions, px strings **and** bare numbers on length props — 38 real violations fixed onto tokens; new `--av-border-width` hairline token + a CSS↔TS parity test. CI `permissions: contents: read`.
- **0-H.5 — repo hygiene.** `.gitignore` now covers every `.env` variant (except `.env.example`), `.envrc`, keys/certs and credential JSON — verified with `git check-ignore`. Real manufacturer example values in `packages/types` replaced with fictional ones. ADRs 0001 and 0003–0007 carried over from the Phase-0 repo with paths updated, so every ADR the code cites now resolves (0002 never existed). **`docs/ADMIN-DESIGN-BRIEF.md` deliberately NOT committed yet:** it names a real manufacturer and its model line as seed data, and ADR-0008 treats a new prospect name as a publication event — held for Yazeed's call together with the visibility decision.
- **0-H.6 — loop-proof finished (code side).** `/api/health` on the consumer app returns the deployed commit. New `smoke.yml` runs on every production deploy: it waits until the **public production domain serves that exact commit** (so it can't pass against the previous deploy), then checks health and the home page. Server-side flags via `apps/consumer/lib/flags.ts`, which **fails closed** (no key, error, timeout → off) — tested. `health_build_info` gates build details. **Still open:** the live create → off → on → kill run (`docs/runbooks/flag-kill-path.md`) needs the PostHog key in Vercel env; the smoke workflow first runs on the first production deploy after merge; auto-rollback needs a Vercel token secret.
- **0-H.7 — ops closure.** Old repo's farewell README pushed (`6867f2c`; archiving is Yazeed's toggle). `CommandEnvelope` / `SignalEnvelope` are now discriminated unions — a mismatched command/data pair fails typecheck, enforced by `@ts-expect-error` tests (proven: removing one makes `tsc` fail). Sentry transplanted from the Phase-0 app into `apps/consumer` (client/server/edge, `global-error`, no PII, no-op without a DSN). PostHog client wired **privacy-conservatively** — no autocapture, no pageviews, no recording, no device storage — until the consent flow is specced (1·C); a test locks that in.
- **Supabase** is restored and healthy again.

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

**Phase 0-H is fully built — 8 stacked PRs, each green. Merge them in order: #2 → #3 → #4 → #5 → #6 → #7 → #8 → the 0-H.7 PR.** Each retargets to `main` when the one below it merges.

**Claude Code, after each merge:**

1. After #3: confirm the **Supabase check is green on `main`** (REV2's gate for 1·A).
2. After #4 and #6: add `isolation` and `secrets` to `main`'s required status checks alongside `verify`.
3. After #5: confirm migration `20260921151103_rls_hardening` reached the **hosted** DB (`list_migrations`). If the Supabase integration didn't apply it, ask Yazeed before applying it by hand, then re-run the Supabase security advisors.
4. After #8: watch the first run of `smoke.yml` on the production deploy.
5. When the PostHog key is in Vercel env: run `docs/runbooks/flag-kill-path.md` and record the result here.

**Do not start any 1·A slice** until all of 0-H is merged, the Supabase check is green on `main`, **and** the base `SPEC-engine-core-1A.md`, the theming REV and the design exports are in the repo. REV2 only amends them, and none of them are here.
