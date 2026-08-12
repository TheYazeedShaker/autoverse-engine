# the Engine — Build Progress

> **Living document.** `CLAUDE.md` holds permanent standards. **This file changes every session** — read at session start, update at session end: fill _What Was Built Last Session_, refresh _Status_, append _Decisions_ / _Known Issues_, rewrite _Next Session — Start Here_ precisely.

**Last updated:** 2026-08-12
**Last session:** Executed `specs/SPEC-engine-migration.md` steps 1–4. The repo is scaffolded and the organs are transplanted with every carried test green. **Steps 5, 6 and 8 are blocked on five account-level items flagged in `#build`** — most urgently, the GitHub remote points at a **public** repo named `autoverase-engine` (typo), so nothing has been pushed.

---

## THE PLAN (the only one)

**Autoverse** (company) builds **the Engine** (this repo) powering all products. **Phase 1:** the Engine + three apps serving five surfaces — `apps/consumer` (ONE app: Showroom / Brochure / Configurator behind per-brand entitlement gates), `apps/dashboard` (brand, tier-gated), `apps/admin` (operations). One brand, one model, end-to-end, production-hardened, multi-tenant + multi-market in structure. **Phase 2 (separate repo, later):** the Autoverse consumer platform product, built on the Engine's accumulated data. Governing docs in `docs/`; production plan v2.1 wins conflicts.

---

## Status

| Track                             | Status                 | Notes                                                                                                                                                                                                                                 |
| --------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ENGINE-MIGRATION`                | 🟡 **Blocked mid-way** | Steps 1–4 done locally, all gates green. Steps 5 (rewire), 6 (loop-proof), 8 (archive) blocked on the five account-level items below; step 7 (Storybook resume) correctly still gated behind the loop-proof. Still blocks everything. |
| Storybook / design system         | ⏸ Paused for migration | Transplanted and green in this repo (9 Tier-1 components, Storybook builds). Resumes after loop-proof. All decisions locked (sub-palette · Radix · restrained/precise · fonts self-hosted OFL).                                       |
| Phase 1·A — Engine core           | ⏳ Held                | Spec arrives after migration completes.                                                                                                                                                                                               |
| Phase 1·B — Pipeline & admin      | ⏳ Held                | 7-stage board, render orchestration, AI content w/ approval gate.                                                                                                                                                                     |
| Phase 1·C — Consumer app          | ⏳ Held                | Design-first: pages designed in Claude Design after Tier 1 → specs → build.                                                                                                                                                           |
| Phase 1·D — Dashboard & hardening | ⏳ Held                |                                                                                                                                                                                                                                       |
| Architecture v3 doc               | ✅ Done                | `docs/engine-architecture.html` — supersedes all earlier architecture versions.                                                                                                                                                       |

## What Was Built Last Session

`ENGINE-MIGRATION` steps 1–4, all local, one commit on `main` (`b32bc23`, **not pushed**).

**Step 1 — structure.** Scaffolded exactly as `CLAUDE.md` defines: `packages/{design-tokens,ui,types,engine-core}`, `apps/{consumer,dashboard,admin}`, `services/`, `supabase/{migrations,tests}`, `docs/`, `specs/`, `.claude/`, `.github/`. `engine-core` and the three apps are empty scaffolds that build and nothing else — each app is a bare Next.js 16 app with one page; `services/README.md` sketches the five edge functions without building any. `packages/config` also carried (not in the `CLAUDE.md` tree but required to compile — it holds the shared tsconfig).

**Step 2 — provided files.** `CLAUDE.md` + `PROGRESS.md` at root; the full doc set in `docs/` (journey blueprint, production plan v2.1, model delivery spec, hosting decision, design brief, manifest template, architecture v3); the three Storybook specs **and** the migration spec moved from `docs/specs/` to root `specs/`.

**Step 3 — transplant.** `packages/tokens` → `packages/design-tokens` (directory renamed per `CLAUDE.md`; **package name stays `@autoverse/tokens`** so no import in `ui` had to change), plus `ui`, `types`, `config` as-is. `.claude/` (3 subagents, 5 skills, secret-scan hook) and `.github/workflows/ci.yml` carried unchanged. `apps/web` deliberately did **not** carry — the Engine's consumer surfaces are one gated app.

Two bits of wiring needed fixing to compile and pass the wall (wiring, not tests, per the spec's ground rule):

- `packages/types` had **no `tsconfig.json` and no `typecheck` script** — it was silently skipping the strict-types gate in the old repo. Both added.
- `.prettierignore` pointed at the dead `apps/web/next-env.d.ts` path → now `apps/*/next-env.d.ts`.

**Gates green locally:** `format:check` ✓ · `lint` ✓ · `typecheck` 7/7 ✓ · `test` 7/7 ✓ (**116 tests** — 48 tokens incl. the contrast invariant, 68 ui) · `build` 3/3 ✓ · `build-storybook` ✓.

**Step 4 — Supabase.** `0001_init_tenancy.sql` and its cross-tenant isolation test copied in byte-identical; this repo is now the sole migration home. **Applying to a branch DB is blocked** — the `autoverse` project (`drkiapqwlqomysekxstd`) is `INACTIVE` and connections time out.

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

### ⛔ The five blockers (flagged in `#build`, [message](https://auto-verse.slack.com/archives/C0BB2DZT2AX/p1786545225621909))

All five need Yazeed's account access. Nothing was guessed.

1. **GitHub repo — blocks the first push.** The remote is `TheYazeedShaker/autoverase-engine`: spelled **autoverase** (typo — spec and `CLAUDE.md` both say `autoverse-engine`) and **PUBLIC** where the spec says private. Proprietary code was **not** pushed to a public repo. Fix = flip to private + rename, or create `autoverse-engine` private and repoint the remote. Everything downstream waits on this.
2. **Supabase paused.** `autoverse` (`drkiapqwlqomysekxstd`, eu-central-1) is `INACTIVE`; needs restoring before `0001` can apply to a branch DB. Branch DBs bill — cost confirmation needed. Default is still reuse; say the word for a fresh project.
3. **Vercel.** Only `autoverse-web` exists under `autoverse projects`. Need a new project for the monorepo with previews on, connected to the new repo (Git-integration auth is Yazeed's). Note: three apps in one monorepo → decide one Vercel project per app vs one with a root directory.
4. **GitHub Actions secrets.** New repo starts with none. Needs Supabase service-role key + project ref, Sentry DSN/auth token, PostHog key — set by Yazeed, not shared into chat.
5. **Old repo archive.** `TheYazeedShaker/autoverse` is private and not archived. README tombstone is committed locally and unpushed; the toggle is Yazeed's.

### Carried over

- **Action (Yazeed):** send the studio package — `docs/autoverse-model-delivery-spec.html` + `docs/model-manifest-template.yaml` — and lock the shared ID vocabulary + change process. Pipeline entry-point contract.
- Two documentation portals (internal + client-facing) — Phase 1·D.

### New, smaller

- `.env.example` still carries `NEXT_PUBLIC_AUTOVERSE_ORIGIN=https://autoverse.app`. The live Phase-0 value was `https://auto-verse.net`. Left as transplanted rather than guessed — confirm the Engine's configurator origin before the loop-proof.
- Directory `packages/design-tokens` vs package name `@autoverse/tokens` is a deliberate mismatch (minimal-diff transplant). Rename the package later if the inconsistency grates; it touches every import in `ui`.
- `.claude/settings.local.json` was **not** carried (machine-local permission grants full of stale `/d/autoverse` paths, and gitignored anyway).
- The initial transplant commit sits directly on `main`. A repo baseline cannot be created by PR against an empty repo; the `CLAUDE.md` "no direct pushes to main" rule takes effect from the loop-proof onward, which is exactly what step 6 exercises.

## Next Session — Start Here

**Blocked until blocker 1 is cleared.** Do not push, and do not start feature work.

**Claude Code:** resume `specs/SPEC-engine-migration.md` at **step 5**, in this order:

1. Confirm the GitHub repo is private and correctly named, then repoint the remote (`git remote set-url origin …`) and push `main` (commit `b32bc23`) as the baseline.
2. Step 5 — rewire Vercel / Actions secrets / Slack / Sentry / PostHog to this repo, once Yazeed confirms each is provisioned.
3. Step 4's remainder — restore the Supabase project, then apply `0001_init_tenancy` to a **branch** DB and run `supabase/tests/0001_tenancy_isolation.test.sql` against it. Acceptance criterion 3.
4. Step 6 — the loop-proof: one trivial change (a token comment or a docs line) through spec → branch → flag → self-gate → `code-reviewer` + `security-review` → PR → full CI wall → preview + branch-DB migration → merge → prod deploy → smoke → Slack → this file. **This is the acceptance criterion that still stands entirely unmet.**
5. Step 8 — push the old repo's tombstone commit (`ce653fc`) and have Yazeed flip the archive switch.
6. Only then step 7 → resume the Storybook track (`AV-P1-STORYBOOK-FOUNDATIONS` + revisions), Tier-1 slice order. Tier 1 itself is already complete and transplanted, so this picks up at Tier 2 plus the outstanding CI work: wire the `@storybook/test-runner` a11y gate and the Storybook build into the wall (the story-level `test: "error"` gate is inert until then), and the reduced-motion gate.

**Acceptance criteria status:** structure + all workspaces build ✅ · transplant green incl. contrast invariant ✅ · migrations apply to a branch DB ⛔ · CI wall + previews + Slack/Sentry/PostHog ⛔ · loop-proof completed once ⛔ · old repo archived 🟡 (README ready) · no work beyond scaffolds ✅ · this file updated ✅.

**Chat track:** architecture v3 is done. Phase 1·A engine-core spec can be drafted now, but **do not hand it over** until the loop-proof lands.
