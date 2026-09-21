---
name: add-rls-policy
description: Add a new brand-scoped table with correct RLS in one migration.
---

1. Create the table with a NOT NULL `brand_id uuid references public.brands(id)`.
2. In the SAME migration, enable RLS and add the two policies from the pattern in
   supabase/migrations/20260617132328_init_tenancy.sql (staff_all + brand_rw).
3. Add a test proving a brand CANNOT read another brand's rows (this is mandatory).
4. Have the security-review subagent approve before merge.
   Never disable RLS to work around a problem — fix the policy.
