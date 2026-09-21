-- 20260921151103_rls_hardening.sql
-- REV2 Phase 0-H.3 — RLS security fixes on the tenancy spine.
--
--   (a) the profile guard now fires on INSERT, UPDATE and DELETE (it was UPDATE-only, so a
--       future self-signup path could have created a profile that was already superadmin);
--   (b) staff writes are scoped: only superadmin + ops manage brands/profiles, `read_only`,
--       `support` and `content_editor` write nothing here, nobody can change their OWN
--       privileged columns, and only a superadmin can grant, revoke or touch superadmin;
--   (c) the pattern for future brand-scoped tables is corrected (bottom of this file) —
--       brand users read-only, writes via edge functions using the service role;
--   (d) the SECURITY DEFINER helpers move out of `public` into `app_auth`, which PostgREST
--       does not expose, so they are no longer callable at /rest/v1/rpc/*.
--
-- Do NOT "fix" the Supabase advisor lint by revoking EXECUTE on the helpers from
-- `authenticated`/`anon`: RLS policy expressions run with the caller's privileges, so that
-- breaks every tenant-scoped query. Moving the schema is the fix.

-- ============================================================================================
-- (d) helpers leave the API-exposed schema
-- ============================================================================================
create schema if not exists app_auth;
revoke all on schema app_auth from public;
-- RLS policies evaluate these helpers as the calling role, which needs USAGE on the schema.
grant usage on schema app_auth to anon, authenticated, service_role;

-- Policies reference functions by OID, so every existing policy keeps working after the move.
alter function public.current_brand_id()   set schema app_auth;
alter function public.is_autoverse_staff() set schema app_auth;

-- New helper for (b): may the caller create/change/delete brands and profiles?
create or replace function app_auth.can_manage_tenancy()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and platform_role in ('superadmin', 'ops')
  )
$$;

-- ============================================================================================
-- (b) staff write scoping — read stays with every staff role, writes only superadmin + ops
-- ============================================================================================
drop policy brands_staff_all on public.brands;

create policy brands_staff_read on public.brands
  for select using (app_auth.is_autoverse_staff());
create policy brands_manager_insert on public.brands
  for insert with check (app_auth.can_manage_tenancy());
create policy brands_manager_update on public.brands
  for update using (app_auth.can_manage_tenancy()) with check (app_auth.can_manage_tenancy());
create policy brands_manager_delete on public.brands
  for delete using (app_auth.can_manage_tenancy());

-- Staff READ of profiles is already covered by profiles_self_read (own row or any staff).
drop policy profiles_staff_all on public.profiles;

create policy profiles_manager_insert on public.profiles
  for insert with check (app_auth.can_manage_tenancy());
create policy profiles_manager_update on public.profiles
  for update using (app_auth.can_manage_tenancy()) with check (app_auth.can_manage_tenancy());
create policy profiles_manager_delete on public.profiles
  for delete using (app_auth.can_manage_tenancy());

-- ============================================================================================
-- (a) + (b) the privilege guard: INSERT, UPDATE and DELETE, staff included
-- ============================================================================================
-- RLS decides WHICH rows a caller may touch; this trigger decides which VALUES they may set
-- (WITH CHECK cannot see OLD). Triggers fire for every role, so the guard must know who is
-- really writing. Trust is decided from the CONNECTION — `session_user` and the `role` setting,
-- neither of which an API caller can forge — never from whether JWT claims happen to be present:
--
--   'signup' session_user = supabase_auth_admin: GoTrue running a sign-up trigger on
--            auth.users. It carries no JWT, and the new user controls raw_user_meta_data, so it
--            may only create a BARE profile (no tenant, no roles).
--   'server' the service role (edge functions — the sanctioned write path in CLAUDE.md), or a
--            direct database session with no role switched (migrations, the SQL editor).
--   'user'   everything else: anon/authenticated API traffic, anything unrecognised.
--
-- `current_setting('role')` is the SET ROLE value (PostgREST sets it per request); SECURITY
-- DEFINER does not change it, and a caller can only SET ROLE to roles they are a member of.
create or replace function app_auth.request_trust(p_session_user text, p_role text)
returns text language sql immutable set search_path = '' as $$
  select case
    when p_session_user = 'supabase_auth_admin'                          then 'signup'
    when p_session_user = 'authenticator' and p_role = 'service_role'   then 'server'
    when p_session_user = 'authenticator'                                then 'user'
    when p_role in ('anon', 'authenticated')                             then 'user'
    when p_role = 'service_role'                                         then 'server'
    when coalesce(p_role, 'none') = 'none'                               then 'server'
    else 'user'
  end
$$;

create or replace function app_auth.guard_profile_privileges()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  trust       text := app_auth.request_trust(session_user::text, current_setting('role', true));
  caller      uuid := auth.uid();
  caller_role public.platform_role;
  is_manager  boolean;
begin
  if trust = 'server' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if trust = 'signup' then
    if tg_op = 'INSERT' and new.brand_id is null and new.brand_role is null
       and new.platform_role is null then
      return new;
    end if;
    raise exception 'not allowed: sign-up may only create a bare profile (no tenant, no roles)';
  end if;

  -- trust = 'user'
  if caller is null then
    raise exception 'not allowed: anonymous callers cannot write profiles';
  end if;

  -- SECURITY DEFINER (owner bypasses RLS), so this sees the caller's row reliably.
  select platform_role into caller_role from public.profiles where id = caller;
  is_manager := caller_role in ('superadmin', 'ops');

  if tg_op = 'INSERT' then
    if coalesce(is_manager, false) then
      -- Closes the delete-then-recreate route around "nobody changes their own role".
      if new.id = caller then
        raise exception 'not allowed to create your own profile';
      end if;
      if new.platform_role = 'superadmin' and caller_role <> 'superadmin' then
        raise exception 'not allowed: only a superadmin can grant superadmin';
      end if;
      return new;
    end if;
    -- Anyone else (e.g. a future self-signup) may only create a bare profile: no tenant, no roles.
    if new.brand_id is not null or new.brand_role is not null or new.platform_role is not null then
      raise exception 'not allowed to set brand_id / brand_role / platform_role';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.id = caller then
      raise exception 'not allowed to delete your own profile';
    end if;
    if old.platform_role = 'superadmin' and caller_role is distinct from 'superadmin' then
      raise exception 'not allowed: only a superadmin can remove a superadmin';
    end if;
    return old;
  end if;

  -- UPDATE
  if new.id is distinct from old.id then
    raise exception 'not allowed to change a profile id';
  end if;

  -- A superadmin's row is off-limits to everyone but a superadmin — any column, not just roles
  -- (otherwise ops could, say, rename a superadmin to impersonate them).
  if old.platform_role = 'superadmin' and caller_role is distinct from 'superadmin' then
    raise exception 'not allowed: only a superadmin can modify a superadmin profile';
  end if;

  if new.brand_id      is distinct from old.brand_id
     or new.brand_role is distinct from old.brand_role
     or new.platform_role is distinct from old.platform_role then
    if old.id = caller then
      raise exception 'not allowed to change your own brand_id / brand_role / platform_role';
    end if;
    if not coalesce(is_manager, false) then
      raise exception 'not allowed to modify brand_id / brand_role / platform_role';
    end if;
    if caller_role <> 'superadmin'
       and (old.platform_role = 'superadmin' or new.platform_role = 'superadmin') then
      raise exception 'not allowed: only a superadmin can grant, revoke or modify superadmin';
    end if;
  end if;

  return new;
end $$;

-- Accepted risk (security review, 2026-09-21): ops may grant `ops` to any account, including a
-- second account it controls. It cannot reach superadmin by any route.
--
-- Trigger functions cannot be called over RPC anyway; revoking EXECUTE is safe for them
-- (a trigger fires regardless) and keeps the advisor quiet.
revoke execute on function app_auth.guard_profile_privileges() from public, anon, authenticated;

drop trigger profiles_guard_privileged_cols on public.profiles;
drop function public.profiles_guard_privileged_cols();

create trigger profiles_guard_privileges
  before insert or update or delete on public.profiles
  for each row execute function app_auth.guard_profile_privileges();

-- ============================================================================================
-- (c) PATTERN for every future brand-scoped table — supersedes the one at the bottom of
--     20260617132328_init_tenancy.sql, which granted brand users direct writes.
-- ============================================================================================
-- create table public.<thing> ( ..., brand_id uuid not null references public.brands(id) );
-- alter table public.<thing> enable row level security;
--
-- create policy <thing>_staff_read on public.<thing>
--   for select using (app_auth.is_autoverse_staff());
-- create policy <thing>_brand_read on public.<thing>
--   for select using (brand_id = app_auth.current_brand_id());
--
-- NO insert/update/delete policies. Browsers never write to tables (CLAUDE.md, "Data &
-- tenancy"): every write goes through a validated, rate-limited edge function using the
-- service role, which bypasses RLS. Deny-by-default then covers everything else.
--
-- Then add a supabase/tests/*.test.sql proving a brand cannot read another brand's rows
-- AND cannot write any row at all. CI runs it on every PR.
