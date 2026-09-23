-- 0002_rls_hardening.test.sql
-- MANDATORY test for migration 20260921151103_rls_hardening.sql (REV2 0-H.3).
-- Proves: the SECURITY DEFINER helpers left the API schema; trust is decided from the connection,
-- not from JWT presence (sign-up can only create a bare profile); the profile guard blocks
-- escalation at INSERT, UPDATE and DELETE; staff writes are scoped (read_only / support /
-- content_editor write nothing, ops cannot touch a superadmin row or its own profile, nobody
-- changes their own role); anon sees nothing; a brand cannot write another brand's rows.
--
-- Every negative case asserts the error MESSAGE as well, so a block for the wrong reason
-- (an RLS or enum error instead of the guard) cannot pass as a success.
--
-- Runs in CI on every PR (the `isolation` job). A violation RAISES EXCEPTION = a failing test.
-- Rolls back, so no fixture data persists.

begin;

-- Helper for this test only: run a statement, return the error message ('' if it succeeded).
-- Runs as the CALLER (security invoker), so RLS and the guard apply exactly as for real traffic.
-- Lives in its own schema with explicit grants; the whole thing is rolled back at the end.
create schema test_helpers;
grant usage on schema test_helpers to anon, authenticated;
create function test_helpers.try(stmt text) returns text language plpgsql as $$
begin
  execute stmt;
  return '';
exception when others then
  return sqlerrm;
end $$;

-- ===== fixtures, seeded by the database owner (direct session = trusted 'server' context) =====
insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000a1'),  -- Brand A admin
  ('00000000-0000-0000-0000-0000000000b1'),  -- Brand B admin
  ('00000000-0000-0000-0000-0000000000f1'),  -- superadmin
  ('00000000-0000-0000-0000-0000000000f2'),  -- ops
  ('00000000-0000-0000-0000-0000000000f3'),  -- read_only
  ('00000000-0000-0000-0000-0000000000f4'),  -- support
  ('00000000-0000-0000-0000-0000000000f5'),  -- content_editor
  ('00000000-0000-0000-0000-0000000000e1'),  -- brand-new user, no profile yet
  ('00000000-0000-0000-0000-0000000000e2');  -- another user, no profile yet

insert into public.brands (id, slug, name) values
  ('00000000-0000-0000-0000-00000000000a', 'brand-a', 'Brand A'),
  ('00000000-0000-0000-0000-00000000000b', 'brand-b', 'Brand B');

insert into public.profiles (id, brand_id, brand_role, platform_role, display_name) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', 'brand_admin', null, 'A'),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000b', 'brand_admin', null, 'B'),
  ('00000000-0000-0000-0000-0000000000f1', null, null, 'superadmin', 'Super'),
  ('00000000-0000-0000-0000-0000000000f2', null, null, 'ops', 'Ops'),
  ('00000000-0000-0000-0000-0000000000f3', null, null, 'read_only', 'RO'),
  ('00000000-0000-0000-0000-0000000000f4', null, null, 'support', 'Support'),
  ('00000000-0000-0000-0000-0000000000f5', null, null, 'content_editor', 'Editor');

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

-- ---- 2. trust comes from the connection, not from JWT presence ----
do $$
declare got text;
begin
  -- GoTrue sign-up trigger: no JWT, but NOT trusted — the user controls the metadata.
  got := app_auth.request_trust('supabase_auth_admin', 'none');
  if got <> 'signup' then raise exception 'CRITICAL: auth sign-up context classified as % (must be signup)', got; end if;
  got := app_auth.request_trust('supabase_auth_admin', 'service_role');
  if got <> 'signup' then raise exception 'CRITICAL: auth sign-up context classified as % (must be signup)', got; end if;
  -- PostgREST: only a real service_role request is trusted; a missing role is NOT.
  if app_auth.request_trust('authenticator', 'service_role') <> 'server' then raise exception 'FAIL: service role via API not trusted'; end if;
  if app_auth.request_trust('authenticator', 'authenticated') <> 'user' then raise exception 'CRITICAL: authenticated API request trusted'; end if;
  if app_auth.request_trust('authenticator', 'anon') <> 'user' then raise exception 'CRITICAL: anon API request trusted'; end if;
  if app_auth.request_trust('authenticator', 'none') <> 'user' then raise exception 'CRITICAL: API request with no role set is trusted'; end if;
  if app_auth.request_trust('authenticator', null) <> 'user' then raise exception 'CRITICAL: API request with null role is trusted'; end if;
  -- Direct sessions: trusted only while no user role is switched on.
  if app_auth.request_trust('postgres', 'none') <> 'server' then raise exception 'FAIL: migrations / SQL editor not trusted'; end if;
  if app_auth.request_trust('postgres', 'authenticated') <> 'user' then raise exception 'CRITICAL: SET ROLE authenticated trusted'; end if;
  if app_auth.request_trust('postgres', 'anon') <> 'user' then raise exception 'CRITICAL: SET ROLE anon trusted'; end if;
  if app_auth.request_trust('postgres', 'some_custom_role') <> 'user' then raise exception 'CRITICAL: unrecognised role trusted'; end if;
  raise notice 'PASS: trust is decided from the connection (sign-up, API and direct sessions)';
end $$;

-- Simulate the client-side variant of the INSERT threat: a self-signup policy that lets a user
-- create their own profile row. RLS alone would then allow any column values.
create policy test_self_signup on public.profiles
  for insert to authenticated with check (id = auth.uid());

set local role authenticated;

-- ---- 3. INSERT guard: a new user cannot create a privileged profile ----
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated"}', true);
do $$
declare msg text;
begin
  if app_auth.request_trust(session_user::text, current_setting('role', true)) <> 'user' then
    raise exception 'FAIL: this test session is not classified as user — the checks below would prove nothing';
  end if;

  msg := test_helpers.try($q$insert into public.profiles (id, platform_role)
                        values ('00000000-0000-0000-0000-0000000000e1', 'superadmin')$q$);
  if msg not like 'not allowed%' then raise exception 'CRITICAL: self-insert as superadmin not blocked by the guard (%)', msg; end if;
  raise notice 'PASS: self-insert as superadmin blocked by the guard';

  msg := test_helpers.try($q$insert into public.profiles (id, brand_id, brand_role)
                        values ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-00000000000a', 'brand_admin')$q$);
  if msg not like 'not allowed%' then raise exception 'CRITICAL: self-insert into a tenant not blocked by the guard (%)', msg; end if;
  raise notice 'PASS: self-insert into a tenant blocked by the guard';

  msg := test_helpers.try($q$insert into public.profiles (id, display_name)
                        values ('00000000-0000-0000-0000-0000000000e1', 'New User')$q$);
  if msg <> '' then raise exception 'FAIL: a bare self-insert was blocked (guard too strict): %', msg; end if;
  raise notice 'PASS: bare self-insert (no tenant, no roles) allowed';
end $$;

-- ---- 4. read_only / support / content_editor: read everything, write nothing ----
do $$
declare
  who text; n int; msg text;
  staff constant text[] := array[
    '00000000-0000-0000-0000-0000000000f3',  -- read_only
    '00000000-0000-0000-0000-0000000000f4',  -- support
    '00000000-0000-0000-0000-0000000000f5'   -- content_editor
  ];
begin
  foreach who in array staff loop
    perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', who), true);

    select count(*) into n from public.brands;
    if n <> 2 then raise exception 'FAIL: staff % should still read all brands (got %)', who, n; end if;

    update public.brands set name = 'hacked' where id = '00000000-0000-0000-0000-00000000000a';
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'CRITICAL: staff % updated a brand', who; end if;

    delete from public.brands where id = '00000000-0000-0000-0000-00000000000b';
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'CRITICAL: staff % deleted a brand', who; end if;

    msg := test_helpers.try($q$insert into public.brands (slug, name) values ('rogue', 'Rogue')$q$);
    if msg not like '%row-level security%' then raise exception 'CRITICAL: staff % created a brand (%)', who, msg; end if;

    update public.profiles set display_name = 'hacked' where id = '00000000-0000-0000-0000-0000000000a1';
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'CRITICAL: staff % edited another user''s profile', who; end if;

    update public.profiles set brand_role = 'brand_viewer' where id = '00000000-0000-0000-0000-0000000000a1';
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'CRITICAL: staff % changed a brand user''s role', who; end if;
  end loop;
  raise notice 'PASS: read_only, support and content_editor read all and write nothing';
end $$;

-- ---- 5. ops: manages tenancy, cannot escalate or touch a superadmin ----
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f2","role":"authenticated"}', true);
do $$
declare n int; msg text;
begin
  -- positive controls: ops can do its job
  update public.profiles set brand_role = 'brand_analyst' where id = '00000000-0000-0000-0000-0000000000a1';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: ops could not change a brand user''s role (guard too strict)'; end if;
  update public.brands set name = 'Brand A (renamed)' where id = '00000000-0000-0000-0000-00000000000a';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: ops could not update a brand'; end if;
  msg := test_helpers.try($q$insert into public.profiles (id, platform_role)
                        values ('00000000-0000-0000-0000-0000000000e2', 'support')$q$);
  if msg <> '' then raise exception 'FAIL: ops could not provision a support user (%)', msg; end if;
  raise notice 'PASS: ops can manage brands, brand roles and provision staff';

  msg := test_helpers.try($q$update public.profiles set platform_role = 'superadmin'
                        where id = '00000000-0000-0000-0000-0000000000f2'$q$);
  if msg not like 'not allowed%' then raise exception 'CRITICAL: ops promoted itself to superadmin (%)', msg; end if;
  raise notice 'PASS: ops cannot change its own role';

  msg := test_helpers.try($q$update public.profiles set platform_role = 'superadmin'
                        where id = '00000000-0000-0000-0000-0000000000f3'$q$);
  if msg not like 'not allowed%' then raise exception 'CRITICAL: ops granted superadmin via UPDATE (%)', msg; end if;
  msg := test_helpers.try($q$update public.profiles set platform_role = 'superadmin'
                        where id = '00000000-0000-0000-0000-0000000000e2'$q$);
  if msg not like 'not allowed%' then raise exception 'CRITICAL: ops granted superadmin to its own new user (%)', msg; end if;
  raise notice 'PASS: ops cannot grant superadmin by UPDATE';

  msg := test_helpers.try($q$delete from public.profiles where id = '00000000-0000-0000-0000-0000000000e2'$q$);
  if msg <> '' then raise exception 'FAIL: ops could not remove a staff profile it manages (%)', msg; end if;
  msg := test_helpers.try($q$insert into public.profiles (id, platform_role)
                        values ('00000000-0000-0000-0000-0000000000e2', 'superadmin')$q$);
  if msg not like 'not allowed%' then raise exception 'CRITICAL: ops created a new superadmin by INSERT (%)', msg; end if;
  raise notice 'PASS: ops cannot create a superadmin by INSERT';

  msg := test_helpers.try($q$update public.profiles set platform_role = 'ops'
                        where id = '00000000-0000-0000-0000-0000000000f1'$q$);
  if msg not like 'not allowed%' then raise exception 'CRITICAL: ops demoted a superadmin (%)', msg; end if;
  msg := test_helpers.try($q$update public.profiles set display_name = 'Totally the superadmin'
                        where id = '00000000-0000-0000-0000-0000000000f1'$q$);
  if msg not like 'not allowed%' then raise exception 'CRITICAL: ops edited a superadmin''s profile (%)', msg; end if;
  msg := test_helpers.try($q$delete from public.profiles where id = '00000000-0000-0000-0000-0000000000f1'$q$);
  if msg not like 'not allowed%' then raise exception 'CRITICAL: ops deleted a superadmin (%)', msg; end if;
  raise notice 'PASS: ops cannot demote, edit or delete a superadmin';

  msg := test_helpers.try($q$delete from public.profiles where id = '00000000-0000-0000-0000-0000000000f2'$q$);
  if msg not like 'not allowed%' then raise exception 'CRITICAL: ops deleted its own profile (re-create route) (%)', msg; end if;
  raise notice 'PASS: ops cannot delete its own profile';
end $$;

-- ---- 6. superadmin: can grant superadmin, cannot change or delete its own profile's roles ----
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated"}', true);
do $$
declare n int; msg text;
begin
  msg := test_helpers.try($q$update public.profiles set platform_role = 'ops'
                        where id = '00000000-0000-0000-0000-0000000000f1'$q$);
  if msg not like 'not allowed%' then raise exception 'CRITICAL: a superadmin changed its own role (%)', msg; end if;
  raise notice 'PASS: superadmin cannot change its own role';

  update public.profiles set display_name = 'Super (renamed)' where id = '00000000-0000-0000-0000-0000000000f1';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: superadmin could not edit its own display_name'; end if;

  update public.profiles set platform_role = 'superadmin' where id = '00000000-0000-0000-0000-0000000000f2';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: superadmin could not grant superadmin (guard too strict)'; end if;
  raise notice 'PASS: superadmin can edit its own name and grant superadmin to another user';
end $$;

-- ---- 7. a brand cannot write another brand's rows (or its own brand row) ----
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
