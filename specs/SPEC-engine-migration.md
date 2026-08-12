# Build Spec — Engine Migration (fresh repo, transplanted organs)

**Task ID:** `ENGINE-MIGRATION`
**Goal:** stand up the new `autoverse-engine` repository as the single home of the engine and its Phase-1 apps, by transplanting the proven pieces from the Phase-0 repo — not rebuilding them — and proving the delivery loop end-to-end once before any feature work.
**Blocks:** all other work. Nothing builds anywhere until this completes.

## Ground rules

- **Transplant, don't rewrite.** Copied packages arrive with their tests green and history irrelevant. If a copied test fails in the new repo, fix the wiring, not the test.
- **The old repo is frozen the moment this starts:** finish/abandon any in-flight branch, then archive it read-only. No dual-home period.
- **New `CLAUDE.md` and `PROGRESS.md` (provided) are law.** Do not port the old ones or any of their framing.

## Steps

1. **Create `autoverse-engine`** (GitHub, private). Scaffold the structure exactly as `CLAUDE.md` defines: `packages/{design-tokens,ui,types,engine-core}`, `apps/{consumer,dashboard,admin}`, `services/`, `supabase/migrations/`, `docs/`, `specs/`, `.claude/`, `.github/`. Turborepo + pnpm as before. `engine-core` and the three apps start as empty scaffolds (build passes, nothing else) — their content arrives with Phase 1·A specs, not now.
2. **Drop in the provided files:** `CLAUDE.md` + `PROGRESS.md` at root; the doc set into `docs/` (journey blueprint, production plan v2.1, model delivery spec, hosting decision, design brief, manifest template); the three Storybook specs into `specs/`.
3. **Transplant packages as-is:** `design-tokens`, `ui`, `types` — including any Tier-1 Storybook work already completed in the old repo (finished slices move; unfinished slices restart here against the same specs). `.claude/` (subagents, skills, hooks) and the CI workflows move with them; update package scopes/paths only as needed to compile.
4. **Supabase:** keep the existing Supabase project (it already holds migration `0001_init_tenancy` — the engine spine, proven, no production data). Copy the migration files into this repo so it is the sole migration home. Repoint all config/env to this repo's deployments. (If a brand-new Supabase project is preferred for naming hygiene, that is a one-line decision for Yazeed; default is reuse.)
5. **Rewire integrations** to the new repo: Vercel (new project for the monorepo; previews on), GitHub Actions secrets, Slack notifications, Sentry, PostHog. Flag anything requiring Yazeed's account-level access in Slack rather than guessing credentials.
6. **Prove the loop, end to end, once.** Ship one trivial change (e.g., a docs page or a token comment) through the full cycle: spec → branch → flag → self-gate → subagent review → PR → full CI wall → preview + branch-DB migration → merge → production deploy → smoke test → Slack notification → `PROGRESS.md` update. A machine is only proven in the repo it runs in.
7. **Then resume the Storybook track** (`AV-P1-STORYBOOK-FOUNDATIONS` + revisions) in this repo, Tier-1 slice order, per the specs and the ADRs already decided (sub-palette, Radix, restrained/precise).
8. **Archive the old repo** read-only with a README pointing here.

## Acceptance criteria

- [ ] `autoverse-engine` exists with the exact structure; all workspaces build.
- [ ] `design-tokens`, `ui`, `types` transplanted; all carried tests green, including the contrast invariant test.
- [ ] Migrations live here and apply cleanly to a branch database.
- [ ] CI wall runs on PRs; previews deploy; Slack/Sentry/PostHog wired to this repo.
- [ ] The trivial-change loop completed once, evidenced by the PR, the production deploy, and the Slack trail.
- [ ] Old repo archived read-only.
- [ ] No feature, engine, app, molecule, or schema work performed beyond the scaffolds and the trivial loop-proof.
- [ ] `PROGRESS.md` updated at session end.
