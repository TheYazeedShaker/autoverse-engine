---
name: add-rls-policy
description: Add a new brand-scoped table with correct RLS in one migration.
---

1. Create the migration with a timestamp name: `supabase migration new <short_name>`
   (never a hand-numbered `0003_…` file — see supabase/README.md).
2. Create the table with a NOT NULL `brand_id uuid references public.brands(id)`.
3. In the SAME migration, enable RLS and add exactly two **read** policies, per the pattern at
   the bottom of supabase/migrations/20260921151103_rls_hardening.sql:
   - `<thing>_staff_read` — `for select using (app_auth.is_autoverse_staff())`
   - `<thing>_brand_read` — `for select using (brand_id = app_auth.current_brand_id())`
4. Add **no insert/update/delete policies**. Browsers never write to tables (CLAUDE.md,
   "Data & tenancy"): writes go through a validated, rate-limited edge function using the service
   role, which bypasses RLS. Deny-by-default covers everything else.
   (The older pattern in 20260617132328_init_tenancy.sql granted brand users `for all` —
   it is superseded; do not copy it.)
5. Helpers live in `app_auth`, not `public`. Never put a SECURITY DEFINER function in `public`
   (it becomes callable over RPC), and never "fix" that by revoking EXECUTE from
   `authenticated`/`anon` — RLS evaluates helpers as the caller, so that breaks every query.
6. Add a `supabase/tests/*.test.sql` proving a brand CANNOT read another brand's rows AND cannot
   write any row directly (mandatory). CI's `isolation` job runs it on every PR.
7. Have the security-review subagent approve before merge.
   Never disable RLS to work around a problem — fix the policy.
