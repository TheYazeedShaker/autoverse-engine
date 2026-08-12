# the Engine

The shared infrastructure layer owned by **Autoverse** that powers every product built on it —
hosting, structured asset storage, data, tenancy and security, leads, content, webhooks,
entitlements, tiers, and flags.

Naming, precisely: **Autoverse** is the company (and the name of the later consumer platform
product, which lives in its own repo). **The Engine** is this infrastructure layer; it deliberately
has no product name. This repo is the Engine and its Phase-1 applications only.

## Layout

    packages/design-tokens   palette, fonts, spacing/radius/elevation/motion,
                             surface↔foreground pairing + the contrast invariant test
    packages/ui              Storybook + the primitive library
    packages/types           shared entities, event schemas, configurator protocol
    packages/engine-core     typed data-access, entitlements, tiers, flag resolution
    packages/config          shared tsconfig
    apps/consumer            ONE app, three entitlement-gated surfaces:
                             Virtual Showroom · Digital Brochure · Configurator
    apps/dashboard           multi-tenant brand dashboard (tier-gated)
    apps/admin               Autoverse operations portal
    services/                edge functions — the only writers to the database
    supabase/migrations/     all schema change; RLS in every migration

`packages/engine-core`, the three apps, and `services/` are scaffolds today. Their content arrives
with the Phase 1 specs.

## Quick start

    nvm use                 # Node 22
    corepack enable
    pnpm install
    pnpm test               # 116 tests
    pnpm build

Storybook — the design system's documented home — runs from `packages/ui`:

    pnpm --filter @autoverse/ui storybook

## Working here

Read **`CLAUDE.md`** first; it is the operating manual and the permanent standard.
**`PROGRESS.md`** is the changing state — where the build actually is, and what is on hold.
The governing documents live in `docs/`; where anything conflicts, the production plan wins.

A few rules worth knowing before you open a PR:

- Every brand-scoped table ships its `brand_id` **and** its RLS policy in the same migration, with
  a paired cross-tenant isolation test. Tenant isolation is enforced in the database, never in app code.
- Tokens only — no hardcoded hex or px outside `design-tokens`. Every surface pairs its required
  foreground, so dark-on-dark is unrepresentable rather than merely discouraged.
- Everything user-facing ships behind a flag, default off, enforced server-side.
- Secrets live in env / Vercel / Supabase — never in this repo. **This repository is public.**

## Status

Phase 1, early. See `PROGRESS.md` for the current track and the open decisions.
