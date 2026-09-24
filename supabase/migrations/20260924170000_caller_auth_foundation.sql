-- 20260924170000_caller_auth_foundation.sql
-- ENGINE-CORE-1A — the database half of authorizing anonymous capture (1·A blocker 2).
--
-- ingest-event and capture-lead are called by anonymous visitors, so there is no user to
-- authenticate. The owner's direction: authorize the CALLER by
--   * an origin allowlist held on brand_markets,
--   * a per-brand publishable key, and
--   * rate limiting,
-- with a bot check on lead capture as well. The brand is resolved on the server from the key and
-- origin, never taken from the request body. That closes BLOCK finding #1, where a caller-declared
-- brand_id let anyone write into any brand.
--
-- This migration is the part that is the same however the edge functions end up calling it (open
-- in #build-decisions: anon-key RPCs vs the service role). It adds the data and two internal
-- helpers. Nothing here is granted to anon or authenticated.

-- ============================================================================================
-- Origin allowlist, per brand-market
-- ============================================================================================
-- Origins aren't secret (a browser sends them on every request), so they can sit on brand_markets,
-- which signed-in users can already read. Scheme + host (+ port) only, lower-case, no path: that is
-- exactly what an Origin header carries. Plain http is allowed only for localhost development.
create or replace function app_auth.all_origins_valid(origins text[])
returns boolean language sql immutable set search_path = '' as $fn$
  select coalesce(bool_and(
    o ~ '^https://[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+(:[0-9]{1,5})?$'
    or o ~ '^http://localhost(:[0-9]{1,5})?$'
  ), true)
  from unnest(coalesce(origins, '{}'::text[])) as o
$fn$;

alter table public.brand_markets
  add column allowed_origins text[] not null default '{}',
  add constraint brand_markets_allowed_origins_valid check (app_auth.all_origins_valid(allowed_origins));

-- ============================================================================================
-- Publishable keys, per brand
-- ============================================================================================
-- A publishable key ships in the brand's page bundle, like a Stripe pk_. It is NOT a secret. It
-- names the brand; the origin allowlist and rate limit are what make it hard to abuse. So it is
-- stored as-is and the owning brand can read it (to embed it). Revoking sets revoked_at, and the
-- row stays so a leaked key's history stays visible.
create table public.brand_publishable_keys (
  id          uuid primary key default gen_random_uuid(),
  brand_id    uuid not null references public.brands(id) on delete cascade,
  key         text not null unique,
  label       text,
  created_at  timestamptz not null default now(),
  revoked_at  timestamptz,
  constraint brand_publishable_keys_format check (key ~ '^pk_[A-Za-z0-9]{32}$')
);

create index brand_publishable_keys_brand_idx on public.brand_publishable_keys (brand_id);

alter table public.brand_publishable_keys enable row level security;

create policy brand_publishable_keys_staff_read on public.brand_publishable_keys
  for select using ((select app_auth.is_autoverse_staff()));
create policy brand_publishable_keys_brand_read on public.brand_publishable_keys
  for select using (brand_id = (select app_auth.current_brand_id()));

revoke insert, update, delete, truncate on public.brand_publishable_keys from anon, authenticated;

-- Issuing is a service-role operation (the admin portal will call it). The key is 32 base62
-- characters from gen_random_bytes, so it can't be guessed.
create or replace function public.issue_publishable_key(p_brand_id uuid, p_label text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  alphabet constant text := '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  bytes bytea := extensions.gen_random_bytes(32);
  new_key text := 'pk_';
  i int;
begin
  for i in 0..31 loop
    new_key := new_key || substr(alphabet, (get_byte(bytes, i) % 62) + 1, 1);
  end loop;
  insert into public.brand_publishable_keys (brand_id, key, label) values (p_brand_id, new_key, p_label);
  return new_key;
end $fn$;

revoke execute on function public.issue_publishable_key(uuid, text) from public, anon, authenticated;
grant  execute on function public.issue_publishable_key(uuid, text) to service_role;

-- ============================================================================================
-- Resolving a caller
-- ============================================================================================
-- The one place a public request becomes a brand. Returns the brand and market ONLY when the key
-- is live, the origin is on that same brand's allowlist, and the market is live. Anything else
-- returns no row, and the caller learns nothing about which check failed.
create or replace function app_auth.resolve_public_caller(p_key text, p_origin text)
returns table (brand_id uuid, market_code text)
language sql
stable
security definer
set search_path = ''
as $fn$
  select bm.brand_id, bm.market_code
    from public.brand_publishable_keys k
    join public.brand_markets bm on bm.brand_id = k.brand_id
   where k.key = p_key
     and k.revoked_at is null
     and bm.live
     and lower(p_origin) = any (bm.allowed_origins)
   order by bm.market_code
   limit 1
$fn$;

-- ============================================================================================
-- Rate limiting
-- ============================================================================================
-- A fixed-window counter in Postgres, so there's no new vendor (CLAUDE.md priority 2). It lives in
-- app_auth, which the API does not expose. Buckets are opaque strings built by the caller, e.g.
-- 'lead:<brand>:<hashed client>', and never hold a raw IP (personal data).
create table app_auth.rate_limit_hits (
  bucket        text        not null,
  window_start  timestamptz not null,
  hits          integer     not null default 0,
  primary key (bucket, window_start),
  constraint rate_limit_hits_bucket_length check (length(bucket) between 1 and 200)
);

alter table app_auth.rate_limit_hits enable row level security;
revoke all on app_auth.rate_limit_hits from public, anon, authenticated;

-- Counts this hit and says whether it is within the limit. Old windows are cleared as it goes,
-- about 1 call in 100, so the table stays small without a separate job.
create or replace function app_auth.take_rate_limit(p_bucket text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  win timestamptz := to_timestamp(
    floor(extract(epoch from now()) / greatest(p_window_seconds, 1)) * greatest(p_window_seconds, 1));
  n integer;
begin
  insert into app_auth.rate_limit_hits as r (bucket, window_start, hits)
  values (p_bucket, win, 1)
  on conflict (bucket, window_start) do update set hits = r.hits + 1
  returning r.hits into n;

  if random() < 0.01 then
    delete from app_auth.rate_limit_hits where window_start < now() - interval '1 day';
  end if;

  return n <= p_limit;
end $fn$;

revoke execute on function app_auth.resolve_public_caller(text, text)       from public, anon, authenticated;
revoke execute on function app_auth.take_rate_limit(text, integer, integer) from public, anon, authenticated;
grant  execute on function app_auth.resolve_public_caller(text, text)       to service_role;
grant  execute on function app_auth.take_rate_limit(text, integer, integer) to service_role;
