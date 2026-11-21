# The merge map: one Nmesis platform on the Engine

Nmesis and the Engine become **one platform, built on this monorepo**: one design system, one Supabase project, one admin. This folder maps the way there. It is documents only. Nothing here changes a spec, an ADR or the code; changes are proposed in [`decisions.md`](decisions.md).

| Document                           | What it answers                                                                                                |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| [`admin-pages.md`](admin-pages.md) | Every current Nmesis admin page (and the showcase's admin): its approved design, data, verdict, risks and size |
| [`showroom.md`](showroom.md)       | The showcase's engine, compare, brochure template and pages, mapped into `apps/consumer` and `engine-core`     |
| [`data.md`](data.md)               | Every table in both databases, mapped; the target schemas; the zero-downtime move                              |
| [`order.md`](order.md)             | The build order as PRs, with dependencies, gates, sizes and each page's switch-off point                       |
| [`decisions.md`](decisions.md)     | Every open question, with options and a recommendation                                                         |

**Already decided by the owner** (not re-asked here):

- One platform on this monorepo.
- The Engine's admin design wins over the current Nmesis admin.
- The showcase is the base of the consumer showroom: ported, not redesigned.
- The Nmesis admin's features are ported page by page into the Engine admin.
- The configurator server stays where it is, and existing client iframe links keep working.
- The brand dashboard comes after the admin.
- The repo stays public until the merge is finished, then goes private.

## The target platform

### Apps (Next.js, Vercel)

| App              | What it is                                                                                                                                                                                                                                                                | Built from                                                                                            |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `apps/consumer`  | One app, one journey. Showroom (`/`), brochure (`/models/[model]`), configurator (`/configure/[model]`, View / Build / Enhanced), compare (`/compare`), embed (`/embed/[brand]/[model]`), footer and privacy. Each surface is gated per brand-market by server-side flags | The Engine's showroom (slices 1–8), plus the showcase's engine, compare and brochure template, ported |
| `apps/admin`     | The operations portal for Autoverse/Nmesis staff, in the approved admin design: Overview, Brands, Catalog, Pipeline, Content, Leads, Analytics, Commercial and System. Every Nmesis admin feature lands in one of these                                                   | `design-approved/admin/` + the Nmesis admin's features                                                |
| `apps/dashboard` | The brand's own portal, tier-gated. Comes after the admin                                                                                                                                                                                                                 | `design-approved/dashboard/`                                                                          |

### Packages

| Package                  | Role after the merge                                                                                                                                                                                            |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/design-tokens` | The one design system's tokens. The admin's neutral ramp and dual theme are added here, never as hex in pages                                                                                                   |
| `packages/ui`            | Storybook and primitives, now including the admin's dense table, tabs, stepper, drawer and chart primitives                                                                                                     |
| `packages/types`         | Shared entities, event schemas, and the configurator protocol, mapped to the `nmesis:*` embed messages (D19)                                                                                                    |
| `packages/engine-core`   | Typed data access, entitlements (now from `accounts`), tiers, flags. Gains the pure rules from the showcase: pricing, availability, swatches, the manifest normaliser and the brochure's trims-and-colours rule |
| `packages/configurator`  | **Proposed (D18).** The ported image-sequence/panorama engine: client-only, strict TS                                                                                                                           |
| `packages/asset-tools`   | ADR 0022 asset tools, plus the showcase's producer scripts rewritten to emit Engine registration SQL                                                                                                            |
| `packages/config`        | Shared lint, TS and test config (unchanged)                                                                                                                                                                     |

### Services (Supabase edge functions)

**Existing:**

- `capture-lead`: now also takes reserve and interest leads with a configuration snapshot;
- `ingest-event`;
- `validate-theme`;
- `job-worker`: pg_cron, every minute.

**New, from the Nmesis backend.** Each lands in the function PR named here, before the page that uses it ([`order.md`](order.md)):

| Function          | What it does                                                                             | Replaces in the Nmesis backend                           | PR   |
| ----------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------- | ---- |
| `admin-mutate`    | Validated staff writes through role-checked RPCs under the user's JWT; no table DML (D8) | —                                                        | A4b  |
| `staff-admin`     | Invite, resend, switch off, TOTP reset (Auth admin calls)                                | the staff part of `people.js`                            | A7a  |
| `publish-config`  | Writes the configurator server's JSON from Engine tables (D3)                            | —                                                        | A11  |
| `report`          | Monthly client reports and their email                                                   | `report.js`                                              | A17a |
| `alerts`, `costs` | Alerts, anomalies, Cost Explorer, CDN logs, asset storage, run as `job-worker` kinds     | `alerts.js`, `anomalies.js`, `costs.js`, `assetCosts.js` | A18  |
| `frame-keys`      | Asks the configurator server to issue a key; staff-only; never holds the master key      | the frame-key admin routes                               | A18b |
| `finance`         | Invoices, payments, the daily run, the public invoice link                               | `finance.js`                                             | A21  |
| `brochure`        | Render, AI and publish                                                                   | the brochure tool                                        | A25  |

The Nmesis process's timers are split (D4). Finance, alerts, anomalies and costs become `job-worker` kinds. The picture health checks and model-state auto-resume stay on the configurator server, because they are about its own pictures and state.

### The database: one Supabase project (the Nmesis project, D1)

| Schema                | Holds                                                                                                                                                                                      |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `public` (Engine)     | Tenancy (`brands`, `profiles`), catalogue, spec ledger, content and assets, theming, consent texts, keys, leads and activities, raw journey events, DLQs, jobs; the `legacy_ids` crosswalk |
| `app_auth` (Engine)   | RLS helpers, rate limits                                                                                                                                                                   |
| `accounts` (adopted)  | Organisations and their brands, plans and features, subscriptions, invoices and payments, costs, staff invites; the AI Studio's members and usage ledger                                   |
| `ops` (adopted)       | The one audit log, alerts, anomalies, health, configurator online/paused state, frame keys, share links, settings                                                                          |
| `analytics` (adopted) | Configurator events (still written by the configurator server) and daily rollups                                                                                                           |
| `brochures` (adopted) | Brochure documents and publish history, until D23 folds them into `public`                                                                                                                 |

Every schema is described by `supabase/migrations/` in this repo. RLS is on every table, with paired isolation tests. Browsers never write tables. Staff writes go through role-checked RPCs, and no table DML is granted to signed-in users (D8). Staff policies require aal2 (D6).

### What stays outside

| Outside                                            | Why, and how the platform talks to it                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **The configurator server** (the Nmesis Node host) | Serves the live configurators that clients embed. **Its URLs, iframe links, share links (`/c/:id`), encrypted frames and public APIs (analytics, leads, share links) stay as they are.** It reads its catalogue as the same JSON files, now published by the Engine (D3). It reads `ops.model_state` and writes `analytics.events`, `ops.shared_configs` and (until its form moves to `capture-lead`) `ops.leads`. The admin pages and their APIs on this host are switched off page by page |
| **Storage**                                        | Configurator frames and renders in S3 behind CloudFront (encrypted frames, signed URLs); CloudFront logs; the optional 4K master bucket; the Engine's public `showroom-public` bucket (ADR 0020). The Engine registers assets by path (`assets`, ADR 0022) and never proxies bytes                                                                                                                                                                                                           |
| **The AI Studio** (separate Nmesis product)        | Shares the project and `accounts` (members, usage ledger, entitlements). Untouched: its own objects are declared and never altered by Engine migrations, and contract tests keep the shared `accounts` objects working for it (D30)                                                                                                                                                                                                                                                          |
| **Third parties**                                  | Turnstile, email (Resend), PostHog (flags), Sentry, AWS Cost Explorer, the AI providers. Keys live in env or secrets, never in code                                                                                                                                                                                                                                                                                                                                                          |

## Diagram

```text
                          visitors                                    client websites
                             │                                              │ (iframes, share links)
                             ▼                                              ▼
 ┌──────────────────────── apps/consumer ────────────────────────┐   ┌──────────────────────────┐
 │ showroom · brochure · configurator (View/Build) · compare     │   │  CONFIGURATOR SERVER     │
 │ embed (/embed/[brand]/[model], nmesis:* protocol)             │──▶│  (stays where it is)     │
 │ Enhanced mode ─── iframe ─────────────────────────────────────┼──▶│  live configurators,     │
 └──────┬──────────────────────────────┬─────────────────────────┘   │  encrypted frames, /c/:id │
        │ anon read path (RPC)         │ capture-lead / ingest-event │                          │
        ▼                              ▼                             └──┬──────────┬────────────┘
 ┌──────────────────────── ONE SUPABASE PROJECT ─────────────────────┐  │ writes   │ reads its
 │ public · app_auth   (Engine: tenancy, catalogue, leads, events)   │◀─┘ analytics│ catalogue JSON
 │ accounts            (orgs, plans, invoices; AI Studio members)    │    ops       │
 │ ops                 (audit, alerts, model_state, frame keys)      │             │
 │ analytics           (configurator events + rollups)              │             │
 │ brochures           (until folded into public)                   │             │
 │ edge functions: capture-lead · ingest-event · validate-theme ·    │             │
 │   job-worker (pg_cron) · admin-mutate · publish-config ·          │─────────────┘
 │   staff-admin · finance · costs · alerts · frame-keys · brochure ·│  publish-config
 │   report                                                          │
 └───────▲───────────────────────────────▲──────────────────────────┘
         │ staff session + RLS            │ brand session + RLS (tier-gated)
 ┌───────┴──────── apps/admin ───┐   ┌────┴──────── apps/dashboard ──┐        ┌─────────────┐
 │ Overview · Brands · Catalog · │   │ Overview · Leads · Analytics ·│        │ AI Studio   │
 │ Pipeline · Content · Leads ·  │   │ Reports · Models · Billing ·  │        │ (separate,  │
 │ Analytics · Commercial ·      │   │ Settings · Support · Guide    │        │  shares     │
 │ System                        │   │ (after the admin)             │        │  accounts)  │
 └───────────────────────────────┘   └───────────────────────────────┘        └─────────────┘
         assets: S3 + CloudFront (frames, renders) · public bucket (ADR 0020) — registered by path
```
