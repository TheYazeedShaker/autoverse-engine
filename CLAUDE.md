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

spec → branch → build behind flag → self-gate (lint · types · tests · secret-scan) → subagent review (`code-reviewer` + `security-review`) → PR → full CI gate suite → preview deploy + migration on branch DB → QA on preview → merge → production deploy + migration → smoke tests (auto-rollback on failure) → progressive flag enable → docs entry → Slack notify.

`.claude/` provides: subagents (code-reviewer, security-review, test-runner), skills (write-feature-spec, ADR, RLS, analytics-event), secret-scan hook. Use them; record architectural decisions as ADRs.

## Session protocol

1. Read `PROGRESS.md` first. It is the only source of session state and current holds.
2. Never start work `PROGRESS.md` marks as held; ask instead of guessing on open decisions.
3. One PR per slice; post progress to Slack.
4. Update `PROGRESS.md` before ending every session.
