# 0019 — the demo tenant lives in the production database, for now

**Status:** accepted, **time-limited** — 2026-09-26 (owner, `#build-decisions`). Superseded as
soon as condition 3 triggers.

## Context

Each showroom slice is checked on its Vercel preview link, which shows the brand-market with
subdomain `demo` (`docs/runbooks/showroom-preview-demo.md`). For `showroom_catalog` (ADR 0018) to
return it, the demo brand must be **live**, in a **live** market, in the database that Preview's
`SUPABASE_URL` points at.

The options were: (A) a separate non-production database for Preview, with the demo seed only
there; (B) one database for Preview and Production, with the demo brand as a tenant in production.
Security review recommended A. It keeps a synthetic live tenant out of production's admin views,
cross-brand analytics and lead routing, and `demo.<root>` could serve once a production root
domain exists, because the flag is shared.

## Decision

**B, for now.** Production holds no real tenant data yet. A second project would double the
migration upkeep (every migration applied twice, plus free-tier inactivity pauses) for a solo
engineer. The protection A buys matters from the first real brand on, not today.

Conditions (owner):

1. **The demo tenant is obviously synthetic:** slug `demo`, name "Demo brand", and lead routing to
   the owner's inbox only (`brand_market_private.lead_routing_emails`). No real customer contact
   ever goes there. The demo data is seeded by the owner (a local SQL file, not committed, because
   it carries the approved design's real model names).
2. **Its EG market goes off live before `CONSUMER_ROOT_DOMAIN` is set in Production.** Once a
   root domain exists, a live `demo` market would serve at `demo.<root>` in production.
3. **Switch to A (a separate non-production database for Preview) before the first real client
   brand goes live.** Tracked in BACKLOG as `PREVIEW-DB-SEPARATION`, with that trigger.
4. **Admin views and cross-brand analytics exclude or clearly label the demo tenant** when they
   are built (1·B admin portal, 1·D dashboard). Their specs must carry this as an acceptance item.

## Consequences

- Preview and Production share `SUPABASE_URL` / `SUPABASE_ANON_KEY`. That is fine while the only
  tenant is the demo brand, and it is a checkpoint once it isn't.
- The runbook's "Where the seed goes" section records B as the current state and A as the target.
- Before the first real brand goes live, the go-live checklist must show that condition 3 is done.
  Before a production root domain is configured, it must show that condition 2 is done.
- Superseding this ADR: when `PREVIEW-DB-SEPARATION` is done, mark this ADR superseded, and point
  Preview's variables at the new database.
