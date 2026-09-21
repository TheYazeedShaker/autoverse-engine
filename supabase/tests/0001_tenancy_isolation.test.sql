-- 0001_tenancy_isolation.test.sql
-- MANDATORY tenant-isolation test for migration 20260617132328_init_tenancy.sql (CLAUDE.md §6).
-- Proves: a brand cannot read another brand's rows; a brand reads only its own;
-- Autoverse staff get the god-view. Self-contained and idempotent — seeds fixtures,
-- runs assertions as the non-privileged `authenticated` role (so RLS is ENFORCED, not
-- bypassed), and ROLLS BACK so no fixture data persists.
--
-- Runs in CI on every PR (the `isolation` job) against a throwaway local database. See supabase/README.md.
-- A violation RAISES EXCEPTION (the whole script aborts) = a failing test.
-- Success = it runs to COMMIT-less ROLLBACK with no exception and the NOTICEs all say PASS.

begin;

-- ===== fixtures (seeded by the privileged role; auth.users is the FK target) =====
insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000a1'),  -- Brand A staff
  ('00000000-0000-0000-0000-0000000000b1'),  -- Brand B staff
  ('00000000-0000-0000-0000-0000000000c1');  -- Autoverse staff

insert into public.brands (id, slug, name) values
  ('00000000-0000-0000-0000-00000000000a', 'brand-a', 'Brand A'),
  ('00000000-0000-0000-0000-00000000000b', 'brand-b', 'Brand B');

insert into public.profiles (id, brand_id, brand_role, platform_role) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', 'brand_admin', null),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000b', 'brand_admin', null),
  ('00000000-0000-0000-0000-0000000000c1', null, null, 'ops');

-- ===== switch to the role real end-users get; RLS is now enforced =====
set local role authenticated;

-- ---- context: Brand A staff ----
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
do $$
declare own_brand int; other_brand int; own_prof int; other_prof int;
begin
  select count(*) into own_brand   from public.brands   where id = '00000000-0000-0000-0000-00000000000a';
  select count(*) into other_brand from public.brands   where id = '00000000-0000-0000-0000-00000000000b';
  select count(*) into own_prof    from public.profiles where id = '00000000-0000-0000-0000-0000000000a1';
  select count(*) into other_prof  from public.profiles where id = '00000000-0000-0000-0000-0000000000b1';
  if own_brand  <> 1 then raise exception 'FAIL: Brand A cannot read its OWN brand row (got %)', own_brand; end if;
  if other_brand <> 0 then raise exception 'CRITICAL: Brand A CAN read Brand B''s brand row (got %)', other_brand; end if;
  if own_prof   <> 1 then raise exception 'FAIL: Brand A cannot read its OWN profile (got %)', own_prof; end if;
  if other_prof <> 0 then raise exception 'CRITICAL: Brand A CAN read Brand B''s profile (got %)', other_prof; end if;
  raise notice 'PASS: Brand A sees only its own brand + profile';
end $$;

-- ---- context: Brand A staff attempts privilege escalation via self-UPDATE (must FAIL) ----
-- The profiles_guard_privileged_cols trigger must block a non-staff user from changing
-- their own brand_id / brand_role / platform_role. These are the highest-value attacks.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
do $$
declare succeeded boolean;
begin
  -- escalate platform_role -> superadmin (must be blocked by the guard trigger)
  begin
    update public.profiles set platform_role = 'superadmin'
      where id = '00000000-0000-0000-0000-0000000000a1';
    succeeded := true;
  exception when others then succeeded := false;
  end;
  if succeeded then raise exception 'CRITICAL: Brand A escalated itself to platform_role=superadmin'; end if;
  raise notice 'PASS: self-escalation of platform_role blocked';

  -- hop tenants by changing own brand_id (must be blocked)
  begin
    update public.profiles set brand_id = '00000000-0000-0000-0000-00000000000b'
      where id = '00000000-0000-0000-0000-0000000000a1';
    succeeded := true;
  exception when others then succeeded := false;
  end;
  if succeeded then raise exception 'CRITICAL: Brand A switched its own tenant (brand_id)'; end if;
  raise notice 'PASS: self tenant-switch (brand_id) blocked';

  -- change own brand_role (privileged column — any self-change must be blocked)
  begin
    update public.profiles set brand_role = 'brand_analyst'
      where id = '00000000-0000-0000-0000-0000000000a1';
    succeeded := true;
  exception when others then succeeded := false;
  end;
  if succeeded then raise exception 'CRITICAL: Brand A modified its own brand_role'; end if;
  raise notice 'PASS: self brand_role change blocked';

  -- sanity: a NON-privileged self-update (display_name) must still SUCCEED
  begin
    update public.profiles set display_name = 'A Admin'
      where id = '00000000-0000-0000-0000-0000000000a1';
    succeeded := true;
  exception when others then succeeded := false;
  end;
  if not succeeded then raise exception 'FAIL: Brand A cannot update its own display_name (guard too strict)'; end if;
  raise notice 'PASS: non-privileged self-update (display_name) allowed';
end $$;

-- ---- context: Brand B staff (symmetry — isolation is not one-directional) ----
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
do $$
declare own_brand int; other_brand int;
begin
  select count(*) into own_brand   from public.brands where id = '00000000-0000-0000-0000-00000000000b';
  select count(*) into other_brand from public.brands where id = '00000000-0000-0000-0000-00000000000a';
  if own_brand  <> 1 then raise exception 'FAIL: Brand B cannot read its OWN brand row (got %)', own_brand; end if;
  if other_brand <> 0 then raise exception 'CRITICAL: Brand B CAN read Brand A''s brand row (got %)', other_brand; end if;
  raise notice 'PASS: Brand B sees only its own brand';
end $$;

-- ---- context: Autoverse staff (god-view across all tenants) ----
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
do $$
declare all_brands int; all_profs int;
begin
  select count(*) into all_brands from public.brands;
  select count(*) into all_profs  from public.profiles;
  if all_brands <> 2 then raise exception 'FAIL: Autoverse staff should see 2 brands (got %)', all_brands; end if;
  if all_profs  <> 3 then raise exception 'FAIL: Autoverse staff should see 3 profiles (got %)', all_profs; end if;
  raise notice 'PASS: Autoverse staff god-view sees all brands + profiles';
end $$;

rollback;
