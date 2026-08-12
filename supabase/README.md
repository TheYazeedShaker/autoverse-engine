# Supabase

Migrations are forward-only and numbered. **Every brand-scoped table ships its RLS policy in the
same migration that creates it** (see the pattern at the bottom of `0001_init_tenancy.sql`).

Apply locally / to a branch:

    supabase db push           # or: supabase migration up

Rules:

- The `security-review` subagent must approve any migration before merge.
- Add the mandatory cross-tenant test (a brand cannot read another brand's rows) with each new table.
- Never disable RLS to "make it work" — fix the policy.
