# CLAUDE.md — autoverse-engine

Operating manual for Claude Code in this repository. Permanent standards only — session state lives in `PROGRESS.md` (read it at session start, update it at session end, always).

## What this is

**The Engine** is the shared infrastructure layer owned by **Autoverse** (the company) that powers every product built on it — hosting, structured asset storage, data, tenancy and security, leads, content, webhooks, entitlements, tiers, and flags.

Naming, precisely: **Autoverse** = the company, and also the name of the Phase-2 consumer platform product (separate repo, later). **The Engine** = this infrastructure layer; it deliberately has no product name. This repo is the Engine and its Phase-1 applications only.

**Phase 1 ships:** the engine plus three applications serving five product surfaces —

- `apps/consumer` — ONE app, three gated surfaces: Virtual Showroom, Digital Brochure (with light configurator), Configurator page (streamed session). One journey, one session, one analytics trail; surfaces enabled per brand by server-side entitlement flags. Never split into separate apps.
- `apps/dashboard` — multi-tenant brand dashboard (tier-gated analytics, leads).
- `apps/admin` — Autoverse operations portal (pipeline board, catalogue, commercial, cross-brand analytics, ops, RBAC).

**Commercial model:** the Configurator is the mandatory base SKU; Brochure and Showroom attach to it. Surfaces are entitlements; dashboard modules are tiers — two independent flag axes, both resolved server-side. **Data capture is never gated**; upgrades reveal history retroactively.

**Scope boundary (hard rule):** the Engine's world begins at the **upload event** — a 3D file + `manifest.yaml` landing in the structured asset store (see `docs/autoverse-model-delivery-spec.html`). Nothing upstream (studio work at Nmesis) is modeled, described, or built here. The manifest is the single source of truth for what exists per model.

## Governing documents (in `docs/`)

- **Production Plan v2.1 (Engine-Lock)** — the engineering contract: guarantee model, boundary rules, merge wall, observability standard, SLOs, testing strategy, failure handling, DoD. Where anything conflicts, the production plan wins.
- **Journey Blueprint v1.0** — approved consumer journey, admin pipeline (7 stages: upload → render → configurator ready → content → approve → data fill → publish), event capture map, packaging, degraded journeys.
- **Model Delivery Spec v2.0** — the studio handover contract.
- **Hosting Decision Report** — StreamPixel for launch; Vagon at Gulf expansion; session lifecycle stays provider-agnostic.

## Repo structure

```
packages/design-tokens   tokens: palette, fonts (self-hosted, OFL), spacing/radius/
                         elevation/motion, surface↔foreground pairing + invariant test
packages/ui              Storybook (Vite, from this package) + primitive library
packages/types           shared entities, event schemas, configurator protocol (internal)
packages/engine-core     typed data-access layer, entitlements, tiers, flags resolution
apps/consumer            showroom + brochure + configurator surfaces (gated)
apps/dashboard           brand dashboard
apps/admin               admin portal
services/                edge functions: event ingest, leads, upload-watcher,
                         render-orchestrator, content-generation
supabase/migrations/     all schema change; RLS in every migration
docs/  specs/  .claude/  .github/
```

## Priorities when things conflict

1. Correctness, tenant isolation, and observability — never traded.
2. Ship speed and low cost — cut scope, never gates.
3. Premium feel (luxury-automotive benchmark quality on consumer surfaces).
4. Scalable architecture.

## Non-negotiable engineering rules

**Data & tenancy**

- Every brand-scoped table: `brand_id` + RLS policy **in the same migration**, deny-by-default, with a paired cross-tenant isolation test. A migration without its policy fails review.
- Markets are first-class (currency, language/RTL, consent defaults per brand-market).
- Constraints live in the database (FK, not-null, unique, check). Raw events are append-only; aggregates are derived and rebuildable. Audit log on every sensitive mutation.
- Browsers never write directly to tables — validated, rate-limited edge functions only. The service-role key exists only in CI migrations and server-side jobs. The configurator iframe never receives keys, PII, or database access.
- Every cross-boundary payload is schema-validated (Zod) on both sides.

**Delivery & quality**

- Everything user-facing ships behind a flag, default off, server-side enforced, with a verified kill path. Deploy ≠ release.
- The merge wall (production plan §10) is absolute: types strict, lint (no empty catch, no hardcoded tokens), unit + integration + isolation + contract + E2E + a11y + performance budgets + secret scan + observability check. No direct pushes to main, no overrides.
- Structured JSON logging with one trace ID end-to-end; every boundary logged entry/exit; no PII in logs (redacted at the logger). A feature without logging, metrics, and at least one alert is not done.
- Every external call has a timeout, a retry policy (idempotent only), and a defined degraded mode. The consumer page must convert (specs, CTAs, lead capture) with the configurator entirely absent. Events: idempotent `event_id`, at-least-once delivery, DLQ, daily reconciliation. Leads are stricter: synchronous, acknowledged, any failure paged.

**Design system**

- Tokens only — no hardcoded hex/px outside `design-tokens`. Palette: Mist `#F4F7F5`, Onyx `#08090A`, Gunmetal `#222823`, Slate `#575A5E`, Platinum `#A7A2A9`; plus the minimal muted semantic sub-palette (error/success/warning/info) for state feedback only. The car carries the only color.
- **Contrast is structural:** every surface token pairs its required foreground; the invariant test + per-story axe gate make dark-on-dark unrepresentable. WCAG AA always.
- Fonts: Google Sans Flex (Latin) + Cairo (Arabic), self-hosted, `OFL.txt` committed; `lang`/`dir` aware. Bilingual/RTL is a requirement, not an enhancement.
- Interactive primitives build on **Radix UI**, skinned with tokens — never hand-rolled focus/ARIA machinery.
- Motion: **restrained/precise** character; `motion/react` only; tokens in `design-tokens`; components use the semantic motion layer, never raw values; reduced-motion is a blocking CI gate equal to contrast; transform/opacity only; nothing competes with the configurator render.
- Storybook (from `packages/ui`) is the design system's documented home; co-located `Component.tsx` + `.stories.tsx` + `.test.tsx`; every story passes a11y on both surfaces, both directions, both motion modes.

## Build loop (every change)

spec → branch → build behind flag → self-gate (lint · types · tests · secret-scan) → subagent review (`code-reviewer`, plus `security-review` where it applies) → PR → full CI gate suite → preview deploy + migration on branch DB → QA on preview → merge → production deploy + migration → smoke tests (auto-rollback on failure) → progressive flag enable → docs entry → Slack notify.

`.claude/` provides: subagents (code-reviewer, security-review, test-runner), skills (write-feature-spec, ADR, RLS, analytics-event), secret-scan hook. Use them; record architectural decisions as ADRs.

## Working rules (owner, 2026-09-30)

**A. The approved design wins.** Where a spec's text and the approved design (`design-approved/<page>/`) differ on layout, visuals, copy or interaction, follow the design without asking, and note each difference in the PR. Escalate only **security, data, money, legal and consent** questions (Tier B/C as before). This does not override the engineering rules above or the production plan: the design decides what the page looks like and does, never how tenancy, capture, flags or observability work. The design's copy and images are sample content: real names and values come from engine data (see _Names and keys_). The design source is the owner's approved copies, read with the file tools only; the shell reaches them only through `pnpm visual:compare` (rule B).

**B. Visual self-check before any UI PR.** From the repository root, run `pnpm visual:compare <folder>/<name> --built <url>`. It renders the approved design and the built page at **390, 768 and 1440 px, in EN and AR**. Compare them, fix the differences, and show the owner **both screenshot sets in the chat** at each UI stop. The PR gets a text-only note: the `<folder>/<name>` and built URL compared, the widths and languages, and what was fixed. It names no brand, model or asset shown in the design. The renders stay in the OS temp folder: never in the repo, a PR, a PR comment or CI, because they show real brands and the repo is public (owner decision B, 2026-09-30; ADR 0010, _Visual comparison tool_). This replaces any spec acceptance line that asks for screenshots on or attached to a PR: meet it with the sets shown in the chat and the PR's text-only note.

**C. Fewer, bigger PRs.** At most **2–3 PRs per page**, one per coherent part of it (not one per slice). Every CI gate, the reviews (`code-reviewer`, plus `security-review` where it applies) and the isolation tests are unchanged. **Database, security and money changes still go in their own PR first and wait for the owner's merge**; this overrides any spec PR plan that bundles them with UI. Every PR is opened against `main`; never stack a PR on another PR's branch.

**Stops.** Stop after each PR (or each push the owner asks for) for the owner's merge. At every stop give:

- the preview link and exactly what to check, step by step;
- the five-part summary: **finished, blockers, open decisions, PRs (2–3 lines each), tasks for the owner**. Use all five headings every time, "none" when empty.

BACKLOG rows are added only on the owner's instruction.

**Decisions.** Every open decision is its own thread in `#build-decisions`, linked in the summary. There is a standing OK to post those threads. Read the replies at the next session start.

**Hosted actions are the owner's:** Supabase SQL, PostHog flags, Vercel, DNS, Turnstile, Sentry. Give exact steps. For a flag, name the flag, its value and targeting, and when to flip it; never ask for the PostHog connector.

**Human-gated config.** `.claude/` and `.github/` change only through a patch the owner applies. Build it in a scratch git worktree and check it with `git apply --check` against its target branch. Run the guard tests on it (`node --test .claude/hooks/guard.test.mjs .claude/tools/visual-compare.test.mjs`) from a worktree **outside** the OS temp folder (the guard's delete rules allow temp), and again with `TEMP`/`TMP` set to an 8.3 short name (CI's Windows runner uses one).

**Human-only text.** The EG consent value, consent wording, privacy text and all legal text come from the owner. Never invent them.

**Names and keys.** No real manufacturer names anywhere outside `docs/` (ADR 0008). Keys come from env or config, never from code.

**Gate before every push:**

1. root `pnpm lint` (`eslint .`, what CI runs; `turbo lint` misses files);
2. `pnpm turbo typecheck test --force`;
3. `pnpm format:check`;
4. `pnpm --filter @autoverse/consumer build`.

Then the `code-reviewer` subagent, plus `security-review` for anything touching capture, keys, Turnstile, the database, permissions, the guard or inline scripts. Apply blocking findings before pushing.

**Commit messages and PR bodies:** write them with the Write tool to a scratch file, then `git commit -F` / `gh pr create --body-file`. Commits end with the Co-Authored-By line; PR bodies end with the Claude Code line.

## Gotchas (learned the hard way)

- **Machine:** Windows, Git Bash. No Docker, deno, python or WSL, so SQL tests run only in CI.
- **The guard** blocks any shell command whose _text_ mentions a design folder path (heredocs and commit messages included), any recursive grep from the repo root, and `cd "$VAR"`. Use the Grep tool or `git grep -- <dirs>`, and the Write/Edit tools for text containing such words.
- **Edit scripts:** never `String.replace` with replacement text (`$&`, `` $` `` and `$'` are patterns; one duplicated PROGRESS.md). Splice by `indexOf` + `slice`. Backslashes inside heredocs or `node -e` get eaten (a regex `\|` became `|` and overwrote the top of BACKLOG.md once). Use the Edit tool for anything with regex backslashes, a standalone script file for multi-row edits, and grep the result.
- **Git Bash mangles `rev:path` arguments** (`git show origin/main:.claude/x`). Use `git checkout <rev> -- <path>` in a worktree instead.
- **Windows paths:** compare real paths with real paths (`realpathSync.native`). `os.tmpdir()` can be an 8.3 short name, and `path.relative` across drives returns an absolute path.
- **Local browser checks:** the launch config `consumer-fixture`, at `http://demo.localhost:3000`.
  - Mark temporary overrides `// TEMP-LEAD-VIEW` (e.g. `isFlagEnabled` returns true when `SHOWROOM_SOURCE === "fixture"`).
  - Revert them with the Edit tool, then run `git grep -n TEMP-LEAD-VIEW -- apps packages` (must be empty) and `git checkout -- apps/consumer/next-env.d.ts` before committing.
- **The browser pane often doesn't paint,** so `requestAnimationFrame` stalls and scripts time out. Use synchronous layout reads, split long scripts across calls, and take a screenshot to force frames. To sweep widths, load the page in a same-origin iframe and set its width. To verify motion, intercept `Element.prototype.animate`. Motion must animate the `transform` **string** (with matching units) to reach the compositor.
- **Motion (ADR 0026):** its standard is the only set of motion tokens. No raw durations or curves, never ease-in, reduced motion is instant, and no native smooth scroll in components.
- **Images (ADR 0022):** one master per trim per view, content-hashed names, never reuse a name.

## Session protocol

1. Read `CLAUDE.md`, then `PROGRESS.md`, then `BACKLOG.md`. `PROGRESS.md` is the only source of session state, current holds and decisions already made; its _Next Session — Start Here_ says what comes next.
2. Never start work `PROGRESS.md` marks as held, and never re-ask a decision it records. Ask (as a `#build-decisions` thread) instead of guessing on an open one; under rule A, a difference between a spec's text and the approved design is not an open decision.
3. PRs sized by rule C; post progress to Slack.
4. Update `PROGRESS.md` and `BACKLOG.md` at every stop and before ending every session.
