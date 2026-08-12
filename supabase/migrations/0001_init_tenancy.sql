-- 0001_init_tenancy.sql
-- The multi-tenancy spine: brands (tenants), profiles (auth users -> brand + roles),
-- and the Row Level Security pattern every later table follows.
-- RLS is the keystone: tenant isolation is enforced HERE, not in application code.

-- ---------- enums ----------
create type platform_role as enum ('superadmin','ops','content_editor','support','read_only');
create type brand_role    as enum ('brand_admin','brand_analyst','brand_viewer');
create type brand_status  as enum ('draft','live','paused');
create type tier_level    as enum ('free','tier1','tier2','tier3');
create type billing_state as enum ('free','pending_activation','active','past_due','cancelled');

-- ---------- brands (the tenant) ----------
create table public.brands (
  id                uuid primary key default gen_random_uuid(),
  slug              text unique not null,            -- also the configurator brandId
  name              text not null,
  status            brand_status not null default 'draft',
  tier              tier_level   not null default 'free',
  free_period_start timestamptz,
  free_period_end   timestamptz,
  billing_state     billing_state not null default 'free',
  created_at        timestamptz  not null default now()
);

-- ---------- profiles (1:1 with auth.users) ----------
-- Autoverse staff: brand_id NULL + platform_role set.
-- Brand staff:     brand_id set + brand_role set.
create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  brand_id      uuid references public.brands(id) on delete set null,
  platform_role platform_role,
  brand_role    brand_role,
  display_name  text,
  created_at    timestamptz not null default now()
);

-- ---------- helpers (SECURITY DEFINER avoids recursive RLS on profiles) ----------
-- search_path is pinned (public, pg_temp) so a caller cannot shadow `profiles` via a
-- malicious schema; bodies are fully schema-qualified as belt-and-suspenders.
create or replace function public.current_brand_id()
returns uuid language sql stable security definer set search_path = public, pg_temp as $$
  select brand_id from public.profiles where id = auth.uid()
$$;

create or replace function public.is_autoverse_staff()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and platform_role is not null
  )
$$;

-- ---------- enable RLS ----------
alter table public.brands   enable row level security;
alter table public.profiles enable row level security;

-- brands: Autoverse staff see/manage all; brand staff read only their own brand.
create policy brands_staff_all on public.brands
  for all using (public.is_autoverse_staff()) with check (public.is_autoverse_staff());

create policy brands_own_read on public.brands
  for select using (id = public.current_brand_id());

-- profiles: you can always read/update your own row; Autoverse staff see all.
create policy profiles_self_read on public.profiles
  for select using (id = auth.uid() or public.is_autoverse_staff());

create policy profiles_self_update on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

create policy profiles_staff_all on public.profiles
  for all using (public.is_autoverse_staff()) with check (public.is_autoverse_staff());

-- ---------- privilege-column guard (RLS WITH CHECK cannot see OLD, so use a trigger) ----------
-- profiles_self_update lets a user edit their own row, but the privilege columns
-- (brand_id, brand_role, platform_role) must NOT be self-mutable — otherwise a brand
-- user could escalate to platform_role='superadmin' or hop tenants by changing brand_id.
-- Only Autoverse staff (who already have profiles_staff_all) may change these columns.
create or replace function public.profiles_guard_privileged_cols()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if public.is_autoverse_staff() then
    return new;  -- staff legitimately manage tenancy + roles
  end if;
  if new.brand_id      is distinct from old.brand_id
     or new.brand_role is distinct from old.brand_role
     or new.platform_role is distinct from old.platform_role then
    raise exception 'not allowed to modify brand_id / brand_role / platform_role';
  end if;
  return new;
end $$;

create trigger profiles_guard_privileged_cols
  before update on public.profiles
  for each row execute function public.profiles_guard_privileged_cols();

-- ---------- PATTERN for every future brand-scoped table (copy this) ----------
-- create table public.<thing> ( ..., brand_id uuid not null references public.brands(id) );
-- alter table public.<thing> enable row level security;
-- create policy <thing>_staff_all on public.<thing>
--   for all using (public.is_autoverse_staff()) with check (public.is_autoverse_staff());
-- create policy <thing>_brand_rw on public.<thing>
--   for all using (brand_id = public.current_brand_id())
--           with check (brand_id = public.current_brand_id());
-- Then add the mandatory test proving a brand cannot read another brand's rows.
