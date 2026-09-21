# Supabase

Migrations are forward-only. **Every brand-scoped table ships its RLS policy in the same migration
that creates it** (see the pattern at the bottom of `20260617132328_init_tenancy.sql`).

## Naming — timestamps, always

Name every migration `YYYYMMDDHHMMSS_short_name.sql` (UTC), e.g. `20261002143000_catalog.sql`.
`supabase migration new <short_name>` generates the right name for you.

The Supabase CLI and the GitHub integration match local files to the remote database by that
timestamp prefix. The first migration used to be named `0001_init_tenancy.sql`, while the remote
recorded it as `20260617132328`. That mismatch failed the Supabase check on `main`
(`Remote migration versions not found in local migrations directory`). **Never rename or edit a
migration after it has been applied** — add a new one instead.

Apply locally / to a branch:

    supabase db push           # or: supabase migration up

Rules:

- The `security-review` subagent must approve any migration before merge.
- Add the mandatory cross-tenant test (a brand cannot read another brand's rows) with each new table.
- Never disable RLS to "make it work" — fix the policy.
