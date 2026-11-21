# 0027 — one database: the Nmesis project, with its schemas adopted in place

**Status:** accepted — 2026-11-21 (owner; `docs/merge-map/decisions.md` D1, D2). It supersedes ADR 0019 once step H4 of the runbook is done: from then on, Preview has its own project.

## Context

Nmesis and the Engine become one platform with one Supabase project (owner decision). Today there are two:

- **The Nmesis project.** It holds the live data:
  - the configurator server's visitor events;
  - leads and bookings with PII;
  - invoices and payments (gapless, never deleted);
  - every staff account, with mandatory TOTP;
  - the AI Studio's members.

  It uses schemas `accounts`, `ops`, `analytics`, `brochures` and the showcase's `catalog`. Access is server-side.

- **The Engine project.** It holds `public` and `app_auth` from 27 migrations, and a demo tenant (ADR 0019).

The full table-by-table map is in `docs/merge-map/data.md`.

## Decision

1. **The Nmesis project is the one production database.**
   - The Engine's migrations apply to it unchanged.
   - `public` and `app_auth` stay the Engine's.
   - **The Engine's current project becomes Preview**, keeping the demo tenant (ADR 0019 condition 3, BACKLOG #13).
2. **Adopt in place.**
   - `accounts`, `ops`, `analytics` and `brochures` come under `supabase/migrations/` through **one baseline migration**, generated from a schema-only dump of the live project, not from the Nmesis repo's migration files.
   - Every statement is guarded:
     - tables and indexes use `if not exists`;
     - policies and types go in `do` blocks that check the catalogue first;
     - no `create or replace` touches a live function or view unless its body is identical.
   - **The dump is cleaned before it becomes the baseline:**
     - its `GRANT`, `REVOKE`, `ALTER DEFAULT PRIVILEGES` and `OWNER` lines are stripped, so live ACLs are not re-applied;
     - it is scanned for secrets, identifiers and real names (ADR 0008).
   - **Some definitions are not committed:** key-handling functions and the AI Studio's objects. They are left as they are on the live project, while the grant rules below still apply to them.
   - **A drift check** compares definitions, policy expressions, ACLs, `prosecdef` and `proconfig`.
     - The A1 session runs it locally against the dump.
     - Later the owner runs it against production, or it runs as a server-side job, with a read-only catalogue role.
     - It prints only object names and hashes, and it **never runs in CI**, since Actions logs on a public repo are public.
   - From then on, this repo is the only place those schemas change, and any other migration pipeline aimed at that project is disconnected at H4.
   - `catalog` is retired into `public`.
3. **The grant rules live in the same migration as the baseline**, so no database (CI, Preview, production) ever holds the adopted schemas without them:
   - **Staff means aal2** (ADR 0032).
   - **Function grants.** EXECUTE on every SECURITY DEFINER function is revoked `from public, anon, authenticated`, then granted only where needed.
     - Postgres grants EXECUTE to PUBLIC on every new function, so each future function carries its own revoke.
     - Before revoking, each function's callers are listed (function statistics, API logs), so the configurator server and the AI Studio don't break.
   - **Views.** Every adopted view is `security_invoker = true` or service-role only. Materialized views, and anything that reads `auth.users`, are service-role only.
   - **Explicit grants per table** replace schema-wide default privileges.
   - **Default privileges are revoked, not just left out.** Stripping the dump's `ALTER DEFAULT PRIVILEGES` lines keeps them out of CI, but production keeps its live defaults. So the baseline runs `alter default privileges for role <owner> in schema <each> revoke all on tables, sequences, functions from anon, authenticated` for every owner role found in H2.
   - **The migration ends with an asserting `do` block.** It raises if anything in the four schemas is usable by `anon` or `authenticated` outside an allow-list: schema usage, table or sequence privilege, function EXECUTE, a table without RLS, or a `pg_default_acl` entry for those roles. The same assertion is a CI test, because a REVOKE that does nothing only warns.
4. **The live project's current exposure is measured, then closed by A1, before the Engine uses its anon key.**
   - H2 lists what `anon` and `authenticated` can reach today, and each function's callers.
   - A1's migration closes it: the grant rules and the asserting block, tested in CI.
   - The production consumer app is pointed at the Nmesis project **only after A1 merges** (runbook, _After A1_).
   - H4 itself changes no permission on the live project.
5. **One exception, on purpose.** Adopted brand-scoped tables have no Engine brand column from A1 until A10 (DB-5). From DB-5 they carry a **nullable** `brand_uuid` (FK to `public.brands`, `on delete restrict`), until the backfill (A11) fills it. In both phases, until it becomes `not null`:
   - adopted tables get **staff policies only**: no brand-read policy, and never the "no brand" public-read pattern;
   - no policy on them uses `is not distinct from`, `coalesce` or a slug join;
   - the isolation tests cover a user with no profile, a bare profile, an aal1 staff token and a brand user;
   - a CI test lists every policy on the adopted tables;
   - the backfill is verified before any brand-read policy lands.
6. **The data moves by expand → backfill → dual-read → switch writes → freeze → contract.**
   - Each step is its own migration.
   - No step takes a long lock.
   - No public URL changes host.
7. **What never moves:** `analytics.events`, `ops.shared_configs`, `ops.frame_keys` and `ops.model_state`. The configurator server owns their writes, and it stays where it is.
8. **More people become `authenticated`** on a database that holds PII and money: AI Studio members, and any self-sign-up. The runbook checks that Auth sign-ups are off, or intended. Policies that say `to authenticated using (true)` are re-checked in DB-1.
9. **Other credentials.** The configurator server, the AI Studio and the Nmesis backend hold service credentials that will reach Engine tables. Each moves to its own least-privilege credential before Engine leads land there (A8); the steps are with the owner.

## Alternatives considered

- **The Engine project hosts everything.** Rejected:
  - staff accounts, TOTP factors and millions of rows would have to move;
  - the configurator server would need a cutover.
- **A new third project.** Rejected: both moves at once.
- **Copy every Nmesis table into `public`.** Rejected:
  - it moves PII and event history for no functional gain;
  - it breaks the configurator server and the AI Studio, which read and write those schemas today.

## Consequences

**Good**

- No staff account, factor or session moves, and client iframes see no change.
- One schema history, in this repo, under the merge wall.
- Preview finally gets its own database.

**Bad**

- Two styles live side by side until the contract step: text slugs (crosswalked by `public.legacy_ids`, ADR 0030) and uuids.
- The baseline must be regenerated if the live schema changes before it merges.
- Repointing (the integration, function secrets, Vault entries, Vercel env vars) is one owner session, with a backup taken first.
- The Engine's project ref, already published (ADR 0008), becomes the Preview project.

**Runbook:** `docs/runbooks/one-database.md`.
