# the Engine — Build Progress

> **Living document.** `CLAUDE.md` holds permanent standards. **This file changes every session** — read at session start, update at session end: fill _What Was Built Last Session_, refresh _Status_, append _Decisions_ / _Known Issues_, rewrite _Next Session — Start Here_ precisely.

**Last updated:** 2026-08-12
**Last session:** Executed `specs/SPEC-engine-migration.md` steps 1–4; repo scaffolded, organs transplanted, every carried test green, **three commits pushed to `main`** with CI green on them. Four of the five blockers cleared — the repo is now correctly named and **deliberately public** ([ADR-0008](docs/adr/0008-public-repository.md)), and Supabase needed no cleaning. **Still open: Vercel (needs Yazeed's OAuth grant), branch protection on `main`, and the loop-proof itself.** Both subagent reviews ran and found real merge-wall gaps — see Known Issues.

---

## THE PLAN (the only one)

**Autoverse** (company) builds **the Engine** (this repo) powering all products. **Phase 1:** the Engine + three apps serving five surfaces — `apps/consumer` (ONE app: Showroom / Brochure / Configurator behind per-brand entitlement gates), `apps/dashboard` (brand, tier-gated), `apps/admin` (operations). One brand, one model, end-to-end, production-hardened, multi-tenant + multi-market in structure. **Phase 2 (separate repo, later):** the Autoverse consumer platform product, built on the Engine's accumulated data. Governing docs in `docs/`; production plan v2.1 wins conflicts.

---

## Status

| Track                             | Status                 | Notes                                                                                                                                                                                                                                                      |
| --------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ENGINE-MIGRATION`                | 🟡 **Nearly done**     | Steps 1–4 done and pushed, all gates green, CI running. Step 6 (loop-proof) is the last real gap and needs Vercel; step 8 (archive) needs Yazeed's toggle; step 7 (Storybook resume) correctly still gated behind the loop-proof. Still blocks everything. |
| Storybook / design system         | ⏸ Paused for migration | Transplanted and green in this repo (9 Tier-1 components, Storybook builds). Resumes after loop-proof. All decisions locked (sub-palette · Radix · restrained/precise · fonts self-hosted OFL).                                                            |
| Phase 1·A — Engine core           | ⏳ Held                | Spec arrives after migration completes.                                                                                                                                                                                                                    |
| Phase 1·B — Pipeline & admin      | ⏳ Held                | 7-stage board, render orchestration, AI content w/ approval gate.                                                                                                                                                                                          |
| Phase 1·C — Consumer app          | ⏳ Held                | Design-first: pages designed in Claude Design after Tier 1 → specs → build.                                                                                                                                                                                |
| Phase 1·D — Dashboard & hardening | ⏳ Held                |                                                                                                                                                                                                                                                            |
| Architecture v3 doc               | ✅ Done                | `docs/engine-architecture.html` — supersedes all earlier architecture versions.                                                                                                                                                                            |

## What Was Built Last Session

`ENGINE-MIGRATION` steps 1–4, pushed to `main` (`b32bc23`, `330c9a3`, `779b133`) with CI green. Step 6's trivial change sits on branch `docs/loop-proof-readme`.

**Step 1 — structure.** Scaffolded exactly as `CLAUDE.md` defines: `packages/{design-tokens,ui,types,engine-core}`, `apps/{consumer,dashboard,admin}`, `services/`, `supabase/{migrations,tests}`, `docs/`, `specs/`, `.claude/`, `.github/`. `engine-core` and the three apps are empty scaffolds that build and nothing else — each app is a bare Next.js 16 app with one page; `services/README.md` sketches the five edge functions without building any. `packages/config` also carried (not in the `CLAUDE.md` tree but required to compile — it holds the shared tsconfig).

**Step 2 — provided files.** `CLAUDE.md` + `PROGRESS.md` at root; the full doc set in `docs/` (journey blueprint, production plan v2.1, model delivery spec, hosting decision, design brief, manifest template, architecture v3); the three Storybook specs **and** the migration spec moved from `docs/specs/` to root `specs/`.

**Step 3 — transplant.** `packages/tokens` → `packages/design-tokens` (directory renamed per `CLAUDE.md`; **package name stays `@autoverse/tokens`** so no import in `ui` had to change), plus `ui`, `types`, `config` as-is. `.claude/` (3 subagents, 5 skills, secret-scan hook) and `.github/workflows/ci.yml` carried unchanged. `apps/web` deliberately did **not** carry — the Engine's consumer surfaces are one gated app.

Two bits of wiring needed fixing to compile and pass the wall (wiring, not tests, per the spec's ground rule):

- `packages/types` had **no `tsconfig.json` and no `typecheck` script** — it was silently skipping the strict-types gate in the old repo. Both added.
- `.prettierignore` pointed at the dead `apps/web/next-env.d.ts` path → now `apps/*/next-env.d.ts`.

**Gates green locally:** `format:check` ✓ · `lint` ✓ · `typecheck` 7/7 ✓ · `test` 7/7 ✓ (**116 tests** — 48 tokens incl. the contrast invariant, 68 ui) · `build` 3/3 ✓ · `build-storybook` ✓.

**Step 4 — Supabase.** `0001_init_tenancy.sql` and its cross-tenant isolation test copied in byte-identical; this repo is now the sole migration home. Project restored and inspected: 2 empty tables, RLS on, 5 policies intact, nothing to clean. **Applying to a _branch_ DB is still outstanding** (billable — needs a cost confirmation), so acceptance criterion 3 is not yet met.

**Step 8 (partial).** Tombstone `README.md` written and committed **locally** in the old repo (`ce653fc`, not pushed) pointing at `autoverse-engine`, with the was-here/now-lives-here table. The archive toggle is Yazeed's.

Also noted: `turbo` now runs fine on this Windows machine — the old missing-UCRT-DLL workaround (per-package scripts) is no longer needed.

## Decisions Made (must be remembered)

- **Naming:** Autoverse = company; the Engine = engine (this repo); Autoverse = also the Phase-2 platform product (separate repo, later).
- **One consumer app**, three gated surfaces — one journey, one session, one analytics trail; entitlements are flags, not codebases.
- **Transplant, don't rebuild:** design-tokens / ui / types / .claude / CI / migration 0001 carry as-is; delivery loop re-proven in the new repo before any feature work.
- **Boundary:** the Engine begins at the upload event (3D file + manifest.yaml); studio process never modeled. Manifest = source of truth per model; shared ID vocabulary with the studio, exact spelling.
- **In-house:** Unreal render farm + configurator are Autoverse-side; farm reached only via job queue + scoped bucket key; configurator stays decoupled behind the versioned iframe protocol (internal spec, from old doc 03, re-audienced later).
- **Hosting:** StreamPixel for launch (accepted risk: no written SLA, 3-yr vendor relationship; revisit if a brand contract carries uptime terms; Vagon Frankfurt fallback configured). Vagon at Gulf expansion; self-host ≥ ~50 sustained CCU or forced by residency/4K/IP.
- **AI content:** conditioning on renders (not fine-tuning); fixed versioned prompts (data, in admin); human approval state machine; brochure renders without AI blocks. Per-model LoRA = Later.
- **Content-gen chain:** renders → image gen (reference-conditioned) → APPROVAL → image-to-video (banner aspects) → approval; copy generated as structured blocks per brand voice profile, EN+AR, same gate. One provider adapter, per-stage swappable; provider picks = ADRs after a bake-off (candidates incl. Higgsfield API vs fal.ai/Replicate for image+video; Claude API for copy). Asset layout: assets/{brand}/{model}/v{n}/{source|renders|content}/... per architecture §07.
- **Design system:** locked monochrome palette + muted semantic sub-palette (state only); structural contrast pairing + invariant test; Radix; motion restrained/precise with semantic layer + reduced-motion CI gate; Storybook from `packages/ui`; fonts self-hosted (both OFL).
- **Design workflow:** Storybook Tier 1 first → import design system into Claude Design from this repo → `CLAUDE-DESIGN-BRIEF.md` as art direction → co-founder reviews there → approved page returns to chat → locked spec → build.
- Later (documented in place, not dropped): ML scoring, checkout, lead resale (legal+consent), custom domains, per-model fine-tunes, Egypt PDPL counsel check before public launch.

## Known Issues / TODOs

### The five blockers — four cleared 2026-08-12

1. ✅ **GitHub repo.** Renamed to `autoverse-engine`. **Deliberately public** — see [ADR-0008](docs/adr/0008-public-repository.md); the exposure was reviewed and accepted, stop re-raising it. Remote repointed, `main` pushed.
2. ✅ **Supabase restored** and inspected. **Nothing needed cleaning** — `public` holds exactly `brands` and `profiles`, both empty, RLS on, all 5 policies intact, 0 auth users, 0 storage objects, 1 migration. That is the Engine tenancy spine as `CLAUDE.md` defines it; there is no platform-era residue. Only the project's display name still says "autoverse", which is cosmetic.
3. ⛔ **Vercel — still open, and not something Claude can do.** The Vercel MCP can only deploy files directly (no Git link). A per-PR preview requires the Vercel GitHub App installed on the repo, which is an OAuth grant only Yazeed can approve. Settings needed are in _Next Session_ below.
4. ✅ **GitHub Actions secrets — none are needed yet.** Verified: `ci.yml` references no secrets and **no source file reads `process.env`** (the scaffolds are inert). Adding secrets to a public repo before anything consumes them is pure risk. The real list is in _Next Session_, tied to the job that will need it.
5. ⛔ **Old repo archive.** `TheYazeedShaker/autoverse` is private and not archived. README tombstone committed locally (`ce653fc`), unpushed; the toggle is Yazeed's.

### From the subagent reviews (2026-08-12) — real gaps, none blocking the migration

`code-reviewer` and `security-review` both ran against the transplant. Full findings are in the session; the ones that must not be lost:

- **The mandatory cross-tenant isolation test is executed by nothing.** `supabase/tests/0001_tenancy_isolation.test.sql` is a strong 120-line test, and no CI job runs it — `pnpm test` is `turbo run test`, which is JS only. `CLAUDE.md` calls the merge wall absolute; this is the single biggest hole in it. **This is the job that will need the Supabase secrets.**
- ~~**`main` has no branch protection**~~ ✅ **fixed 2026-08-12.** `main` now requires a PR and a passing `verify` check, with `enforce_admins: true` so there is no override — verified by an actual rejected push, not just the API response. Force-push and deletion blocked; conversation resolution required; 0 required approvals so a solo engineer can still merge their own PR. Linear history deliberately **not** required, so the existing merge-commit style keeps working. To relax in an emergency: `gh api -X DELETE repos/TheYazeedShaker/autoverse-engine/branches/main/protection`.
- **CI implements 5 of ~12 required gates.** Missing: isolation, a11y (the `test: "error"` gate in `preview.tsx` is inert without `@storybook/test-runner` in CI), reduced-motion, secret scan, and the "no hardcoded tokens" lint rule. `eslint.config.mjs` also ignores all `*.js`, so the three `next.config.js` files are never linted.
- **`profiles_guard_privileged_cols()` is `before update` only.** Harmless today because no INSERT policy exists for non-staff — but the moment a self-signup INSERT path is added, a user can set `platform_role = 'superadmin'` at insert time and the guard never fires. Make it `before insert or update` **before any profile-provisioning ships**.
- **Staff RBAC is decorative at the DB layer.** `is_autoverse_staff()` is true for any non-null `platform_role`, and the staff policies are `for all` — so `read_only` and `support` staff currently have full write access to every brand and can promote themselves.
- **The pattern comment at `0001_init_tenancy.sql:98-106` contradicts `CLAUDE.md`.** It tells every future table to use `for all using (brand_id = current_brand_id())`, which would hand brand users direct INSERT/UPDATE/DELETE over PostgREST. Should be `for select` for brand users, writes via service-role edge functions only. `.claude/skills/add-rls-policy/SKILL.md` repeats the same instruction and needs the same fix.
- **The Supabase advisor's SECURITY DEFINER warning was largely a false alarm** — verified empirically against the live DB. `profiles_guard_privileged_cols()` is not reachable over RPC at all (Postgres refuses to call trigger functions directly). The other two disclose only the caller's own brand/staff status. **Do not apply the advisor's suggested fix:** revoking `EXECUTE` breaks RLS entirely, because policy expressions are evaluated with the caller's privileges — this was tested and rolled back. The correct fix is `alter function … set schema app_auth` to move them out of the PostgREST-exposed schema; policies follow the OID automatically. Worth doing as `0002` while there are only 2 tables and 5 policies referencing them.
- **`CommandEnvelope` / `SignalEnvelope` are not discriminated unions** (`packages/types/src/index.ts:73-105`) — `command` and `data` are independent unions, so mismatched pairs typecheck. This is the configurator protocol `CLAUDE.md` calls the single source of truth. Transplanted as-is; fix in the first slice that touches it.
- **RTL and a11y test coverage gaps.** No test anywhere asserts `dir="rtl"`; 4 of 9 components have no axe assertion (`Container`, `Grid`, `Icon`, `Text`). `CLAUDE.md` demands both surfaces, both directions, both motion modes — two of those three axes have no automated coverage.
- Follow-ups created by the public-repo decision (gitignore breadth, the secret-scan hook not guarding real commits, CI `permissions:` block, real manufacturer names in `types`) are listed in [ADR-0008](docs/adr/0008-public-repository.md).

### Carried over

- **Action (Yazeed):** send the studio package — `docs/autoverse-model-delivery-spec.html` + `docs/model-manifest-template.yaml` — and lock the shared ID vocabulary + change process. Pipeline entry-point contract.
- Two documentation portals (internal + client-facing) — Phase 1·D.

### New, smaller

- `.env.example` still carries `NEXT_PUBLIC_AUTOVERSE_ORIGIN=https://autoverse.app`. The live Phase-0 value was `https://auto-verse.net`. Left as transplanted rather than guessed — confirm the Engine's configurator origin before the loop-proof.
- Directory `packages/design-tokens` vs package name `@autoverse/tokens` is a deliberate mismatch (minimal-diff transplant). Rename the package later if the inconsistency grates; it touches every import in `ui`.
- `.claude/settings.local.json` was **not** carried (machine-local permission grants full of stale `/d/autoverse` paths, and gitignored anyway).
- The three baseline commits sit directly on `main` — the transplant, this file, and a numbering fix. A repo baseline cannot be PR'd against an empty repo, so the first was unavoidable; the other two were ordinary docs commits that should have gone through a branch, and `main` had no protection to stop them. **Enable branch protection before anything else lands.**

## Next Session — Start Here

**Claude Code:** finish `specs/SPEC-engine-migration.md`. Remaining, in order:

1. ✅ **Branch protection on `main`** — done, see Known Issues. From here every change goes through a PR; there is no admin override.
2. **Step 6, the loop-proof** — the one acceptance criterion still entirely unmet. Branch `docs/loop-proof-readme` carries the root `README.md` + [ADR-0008](docs/adr/0008-public-repository.md) and is ready to PR. CI runs on PRs already (verified: run on the `main` push succeeded). Missing links in the chain: the **preview deploy** (blocked on Vercel, below) and the **flag enable** — note a docs-only change has no flag to wire, and the PostHog MCP is unauthorized in this session, so that link stays unproven until the first user-facing feature.
3. **Vercel — needs Yazeed.** Claude cannot create a Git-connected project; the Vercel GitHub App is an OAuth grant. Settings to use: import `TheYazeedShaker/autoverse-engine` → **Root Directory `apps/consumer`** → framework Next.js → build `pnpm build`, install `pnpm install` → previews on. One project for `apps/consumer` only; `dashboard` and `admin` are empty scaffolds and get their own projects when they have content.
4. **Step 4's remainder** — apply `0001_init_tenancy` to a **branch** DB and run the isolation test against it. Acceptance criterion 3. Branch DBs bill, so needs a cost confirmation.
5. **Wire the isolation test into CI** — the biggest merge-wall hole. This is the job that finally needs secrets: `SUPABASE_ACCESS_TOKEN` (personal access token, for the CLI) and `SUPABASE_PROJECT_REF`, or a direct `SUPABASE_DB_URL` for the branch DB. Nothing else is needed today. Sentry/PostHog values belong in **Vercel env**, not GitHub secrets, and only once app code actually reads them.
6. **Step 8** — push the old repo's tombstone commit (`ce653fc`) and have Yazeed flip the archive switch.
7. **Only then step 7** → resume the Storybook track, Tier-1 slice order. Tier 1 is already complete and transplanted, so this picks up at Tier 2 plus the outstanding CI work: the `@storybook/test-runner` a11y gate, the Storybook build, and the reduced-motion gate.

**Acceptance criteria status:** structure + all workspaces build ✅ · transplant green incl. contrast invariant ✅ · migrations apply to a branch DB ⛔ · CI wall runs on PRs ✅ / previews ⛔ / Slack ✅ / Sentry + PostHog ⛔ (nothing consumes them yet) · loop-proof completed once ⛔ · old repo archived 🟡 (README ready) · no work beyond scaffolds ✅ · this file updated ✅.

**Chat track:** architecture v3 is done. Phase 1·A engine-core spec can be drafted now, but **do not hand it over** until the loop-proof lands.
