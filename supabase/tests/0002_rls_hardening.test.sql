-- 0002_rls_hardening.test.sql
-- MANDATORY test for migration 20260921151103_rls_hardening.sql (REV2 0-H.3).
-- Proves: the SECURITY DEFINER helpers left the API schema; the profile guard blocks
-- escalation at INSERT as well as UPDATE; staff writes are scoped (read_only / support write
-- nothing, ops cannot touch superadmin, nobody changes their own role); anon sees nothing;
-- a brand cannot write another brand's rows.
--
-- Runs in CI on every PR (the `isolation` job). A violation RAISES EXCEPTION = a failing test.
-- Rolls back, so no fixture data persists.

begin;

-- ===== fixtures, seeded by the database owner (no JWT = trusted server context) =====
insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000a1'),  -- Brand A admin
  ('00000000-0000-0000-0000-0000000000b1'),  -- Brand B admin
  ('00000000-0000-0000-0000-0000000000f1'),  -- superadmin
  ('00000000-0000-0000-0000-0000000000f2'),  -- ops
  ('00000000-0000-0000-0000-0000000000f3'),  -- read_only
  ('00000000-0000-0000-0000-0000000000f4'),  -- support
  ('00000000-0000-0000-0000-0000000000e1');  -- brand-new user, no profile yet

insert into public.brands (id, slug, name) values
  ('00000000-0000-0000-0000-00000000000a', 'brand-a', 'Brand A'),
  ('00000000-0000-0000-0000-00000000000b', 'brand-b', 'Brand B');

insert into public.profiles (id, brand_id, brand_role, platform_role) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', 'brand_admin', null),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000b', 'brand_admin', null),
  ('00000000-0000-0000-0000-0000000000f1', null, null, 'superadmin'),
  ('00000000-0000-0000-0000-0000000000f2', null, null, 'ops'),
  ('00000000-0000-0000-0000-0000000000f3', null, null, 'read_only'),
  ('00000000-0000-0000-0000-0000000000f4', null, null, 'support');

-- ---- 1. helpers are gone from the API-exposed schema ----
do $$
begin
  if to_regprocedure('public.current_brand_id()') is not null
     or to_regprocedure('public.is_autoverse_staff()') is not null
     or to_regprocedure('public.profiles_guard_privileged_cols()') is not null then
    raise exception 'CRITICAL: a SECURITY DEFINER helper is still in public (callable over RPC)';
  end if;
  if to_regprocedure('app_auth.current_brand_id()') is null
     or to_regprocedure('app_auth.is_autoverse_staff()') is null
     or to_regprocedure('app_auth.can_manage_tenancy()') is null then
    raise exception 'FAIL: app_auth helpers missing';
  end if;
  raise notice 'PASS: SECURITY DEFINER helpers live in app_auth, not public';
end $$;

-- Simulate the threat the INSERT guard exists for: a future self-signup policy that lets a
-- user create their own profile row. RLS alone would then allow any column values.
create policy test_self_signup on public.profiles
  for insert to authenticated with check (id = auth.uid());

set local role authenticated;

-- ---- 2. INSERT guard: a new user cannot create a privileged profile ----
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated"}', true);
do $$
declare ok boolean; msg text;
begin
  begin
    insert into public.profiles (id, platform_role) values ('00000000-0000-0000-0000-0000000000e1', 'superadmin');
    ok := true;
  exception when others then ok := false; msg := sqlerrm;
  end;
  if ok then raise exception 'CRITICAL: a new user created their own profile as superadmin'; end if;
  if msg not like 'not allowed%' then raise exception 'FAIL: superadmin insert blocked for the wrong reason: %', msg; end if;
  raise notice 'PASS: self-insert as superadmin blocked by the guard';

  begin
    insert into public.profiles (id, brand_id, brand_role)
      values ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-00000000000a', 'brand_admin');
    ok := true;
  exception when others then ok := false; msg := sqlerrm;
  end;
  if ok then raise exception 'CRITICAL: a new user attached themselves to a tenant at insert'; end if;
  raise notice 'PASS: self-insert into a tenant blocked by the guard';

  begin
    insert into public.profiles (id, display_name) values ('00000000-0000-0000-0000-0000000000e1', 'New User');
    ok := true;
  exception when others then ok := false; msg := sqlerrm;
  end;
  if not ok then raise exception 'FAIL: a bare self-insert was blocked (guard too strict): %', msg; end if;
  raise notice 'PASS: bare self-insert (no tenant, no roles) allowed';
end $$;

-- ---- 3. read_only staff: reads everything, writes nothing ----
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f3","role":"authenticated"}', true);
do $$
declare n int; ok boolean;
begin
  select count(*) into n from public.brands;
  if n <> 2 then raise exception 'FAIL: read_only staff should still read all brands (got %)', n; end if;

  update public.brands set name = 'hacked' where id = '00000000-0000-0000-0000-00000000000a';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'CRITICAL: read_only staff updated a brand'; end if;

  delete from public.brands where id = '00000000-0000-0000-0000-00000000000b';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'CRITICAL: read_only staff deleted a brand'; end if;

  begin
    insert into public.brands (slug, name) values ('rogue', 'Rogue');
    ok := true;
  exception when others then ok := false;
  end;
  if ok then raise exception 'CRITICAL: read_only staff created a brand'; end if;

  update public.profiles set display_name = 'hacked' where id = '00000000-0000-0000-0000-0000000000a1';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'CRITICAL: read_only staff edited another user''s profile'; end if;

  raise notice 'PASS: read_only staff reads all, writes nothing';
end $$;

-- ---- 4. support staff: cannot change anyone's role ----
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f4","role":"authenticated"}', true);
do $$
declare n int;
begin
  update public.profiles set brand_role = 'brand_viewer' where id = '00000000-0000-0000-0000-0000000000a1';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'CRITICAL: support staff changed a brand user''s role'; end if;
  raise notice 'PASS: support staff cannot change roles';
end $$;

-- ---- 5. ops: manages tenancy, cannot escalate ----
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f2","role":"authenticated"}', true);
do $$
declare n int; ok boolean;
begin
  -- positive controls: ops can do its job
  update public.profiles set brand_role = 'brand_analyst' where id = '00000000-0000-0000-0000-0000000000a1';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: ops could not change a brand user''s role (guard too strict)'; end if;
  update public.brands set name = 'Brand A (renamed)' where id = '00000000-0000-0000-0000-00000000000a';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: ops could not update a brand'; end if;
  raise notice 'PASS: ops can manage brands and brand roles';

  begin
    update public.profiles set platform_role = 'superadmin' where id = '00000000-0000-0000-0000-0000000000f2';
    ok := true;
  exception when others then ok := false;
  end;
  if ok then raise exception 'CRITICAL: ops promoted itself to superadmin'; end if;
  raise notice 'PASS: ops cannot change its own role';

  begin
    update public.profiles set platform_role = 'superadmin' where id = '00000000-0000-0000-0000-0000000000f3';
    ok := true;
  exception when others then ok := false;
  end;
  if ok then raise exception 'CRITICAL: ops granted superadmin to another user'; end if;
  raise notice 'PASS: ops cannot grant superadmin';

  begin
    update public.profiles set platform_role = 'ops' where id = '00000000-0000-0000-0000-0000000000f1';
    ok := true;
  exception when others then ok := false;
  end;
  if ok then raise exception 'CRITICAL: ops demoted a superadmin'; end if;

  begin
    delete from public.profiles where id = '00000000-0000-0000-0000-0000000000f1';
    ok := true;
  exception when others then ok := false;
  end;
  if ok then raise exception 'CRITICAL: ops deleted a superadmin'; end if;
  raise notice 'PASS: ops cannot demote or delete a superadmin';
end $$;

-- ---- 6. superadmin: can grant superadmin, cannot change its own role ----
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated"}', true);
do $$
declare n int; ok boolean;
begin
  begin
    update public.profiles set platform_role = 'ops' where id = '00000000-0000-0000-0000-0000000000f1';
    ok := true;
  exception when others then ok := false;
  end;
  if ok then raise exception 'CRITICAL: a superadmin changed its own role'; end if;
  raise notice 'PASS: superadmin cannot change its own role';

  update public.profiles set platform_role = 'superadmin' where id = '00000000-0000-0000-0000-0000000000f2';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: superadmin could not grant superadmin (guard too strict)'; end if;
  raise notice 'PASS: superadmin can grant superadmin to another user';
end $$;

-- ---- 7. a brand cannot write another brand's rows ----
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
do $$
declare n int;
begin
  update public.profiles set display_name = 'hacked' where id = '00000000-0000-0000-0000-0000000000b1';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'CRITICAL: Brand A edited Brand B''s profile'; end if;

  update public.brands set name = 'hacked' where id = '00000000-0000-0000-0000-00000000000b';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'CRITICAL: Brand A edited Brand B''s brand row'; end if;

  update public.brands set name = 'self-edit' where id = '00000000-0000-0000-0000-00000000000a';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'CRITICAL: a brand user wrote its own brand row directly (writes must go via edge functions)'; end if;

  raise notice 'PASS: brand users write no brand rows, their own or anyone else''s';
end $$;

-- ---- 8. anon sees nothing ----
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$
declare nb int; np int;
begin
  select count(*) into nb from public.brands;
  select count(*) into np from public.profiles;
  if nb <> 0 or np <> 0 then
    raise exception 'CRITICAL: anon can read % brands and % profiles', nb, np;
  end if;
  raise notice 'PASS: anon reads no brands and no profiles';
end $$;

rollback;
