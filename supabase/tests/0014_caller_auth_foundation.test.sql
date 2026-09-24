-- 0014_caller_auth_foundation.test.sql
-- MANDATORY isolation test for migration 20260924170000_caller_auth_foundation.sql.
-- Proves: a public caller resolves to a brand ONLY with a live key, a live brand, the named live
-- market, and an origin on THAT market's allowlist, so brand A's key from brand B's site resolves
-- to nothing, and one origin shared by two brands still resolves each key to its own brand; a
-- revoked key stops working; origins are well-formed and never localhost on a live market; a brand
-- reads its own publishable keys and nobody else's; only the service role writes keys or calls the
-- helpers (proven AS service_role, not as the superuser); and the rate limit cuts off at its limit.

begin;

create schema test_helpers;
grant usage on schema test_helpers to anon, authenticated, service_role;
create function test_helpers.try(stmt text) returns text language plpgsql as $$
begin
  execute stmt;
  return '';
exception when others then
  return sqlerrm;
end $$;

insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000b1'),
  ('00000000-0000-0000-0000-0000000000c1');
insert into public.brands (id, slug, name, status) values
  ('00000000-0000-0000-0000-00000000000a', 'brand-a', 'Brand A', 'live'),
  ('00000000-0000-0000-0000-00000000000b', 'brand-b', 'Brand B', 'live');
insert into public.profiles (id, brand_id, brand_role, platform_role) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', 'brand_admin', null),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000b', 'brand_admin', null),
  ('00000000-0000-0000-0000-0000000000c1', null, null, 'ops');
-- https://shared.example.com is on BOTH brands (e.g. a group dealer site), and brand A serves two
-- markets, one of them dormant.
insert into public.brand_markets (brand_id, market_code, currency, locale, live, allowed_origins) values
  ('00000000-0000-0000-0000-00000000000a', 'EG', 'EGP', 'ar-EG', true,  '{https://a.example.com,https://shared.example.com}'),
  ('00000000-0000-0000-0000-00000000000a', 'SA', 'SAR', 'ar-SA', false, '{https://a.example.com}'),
  ('00000000-0000-0000-0000-00000000000b', 'EG', 'EGP', 'ar-EG', true,  '{https://b.example.com,https://shared.example.com}');

insert into public.brand_publishable_keys (brand_id, key) values
  ('00000000-0000-0000-0000-00000000000a', 'pk_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'),
  ('00000000-0000-0000-0000-00000000000b', 'pk_BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB');

-- ---- 0. well-formed by construction (as the owner, before switching roles) ----
do $$
declare msg text;
begin
  msg := test_helpers.try($q$update public.brand_markets set allowed_origins = '{https://a.example.com/path}'
    where brand_id = '00000000-0000-0000-0000-00000000000a' and market_code = 'SA'$q$);
  if msg not like '%brand_markets_allowed_origins_valid%' then raise exception 'FAIL: an origin with a path was stored (%)', msg; end if;
  msg := test_helpers.try($q$update public.brand_markets set allowed_origins = '{http://a.example.com}'
    where brand_id = '00000000-0000-0000-0000-00000000000a' and market_code = 'SA'$q$);
  if msg not like '%brand_markets_allowed_origins_valid%' then raise exception 'CRITICAL: a plain-http origin was allowed (%)', msg; end if;
  msg := test_helpers.try($q$update public.brand_markets set allowed_origins = '{https://1.2.3.4}'
    where brand_id = '00000000-0000-0000-0000-00000000000a' and market_code = 'SA'$q$);
  if msg not like '%brand_markets_allowed_origins_valid%' then raise exception 'FAIL: an IP-literal origin was allowed (%)', msg; end if;

  -- localhost: fine on a dormant market, refused on a live one.
  msg := test_helpers.try($q$update public.brand_markets set allowed_origins = '{http://localhost:3000}'
    where brand_id = '00000000-0000-0000-0000-00000000000a' and market_code = 'SA'$q$);
  if msg <> '' then raise exception 'FAIL: localhost refused on a dormant market (%)', msg; end if;
  msg := test_helpers.try($q$update public.brand_markets set live = true
    where brand_id = '00000000-0000-0000-0000-00000000000a' and market_code = 'SA'$q$);
  if msg not like '%brand_markets_no_localhost_when_live%' then
    raise exception 'CRITICAL: a live market accepts localhost (%)', msg;
  end if;
  update public.brand_markets set allowed_origins = '{https://a.example.com}'
   where brand_id = '00000000-0000-0000-0000-00000000000a' and market_code = 'SA';

  msg := test_helpers.try($q$insert into public.brand_publishable_keys (brand_id, key)
    values ('00000000-0000-0000-0000-00000000000a', 'short')$q$);
  if msg not like '%brand_publishable_keys_format%' then raise exception 'FAIL: a malformed key was stored (%)', msg; end if;

  msg := test_helpers.try($q$select app_auth.take_rate_limit('x', 0, 60)$q$);
  if msg not like '%at least 1%' then raise exception 'FAIL: a zero rate limit was accepted (%)', msg; end if;
  msg := test_helpers.try($q$select app_auth.take_rate_limit('x', 5, 90000)$q$);
  if msg not like '%1 to 3600%' then raise exception 'FAIL: a window the cleanup could wipe was accepted (%)', msg; end if;
  raise notice 'PASS: origins, keys and limiter arguments are well-formed; no localhost on a live market';
end $$;

-- Everything below that should work is run AS service_role: that is the role the edge functions
-- use, so a dropped grant fails here instead of passing under the superuser.
set local role service_role;

-- ---- 1. the same brand's key + live brand + named live market + that market's origin, or nothing ----
do $$
declare r record;
begin
  select * into r from app_auth.resolve_public_caller('pk_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', 'https://a.example.com', 'EG');
  if r.brand_id is distinct from '00000000-0000-0000-0000-00000000000a'::uuid or r.market_code <> 'EG' then
    raise exception 'FAIL: a valid key from an allowed origin did not resolve to its brand (%)', r;
  end if;

  select * into r from app_auth.resolve_public_caller('pk_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', 'https://A.EXAMPLE.COM', 'EG');
  if r.brand_id is null then raise exception 'FAIL: an upper-case origin did not match'; end if;

  -- Brand A's key, sent from brand B's site: someone lifted it. It must resolve to NOTHING.
  select * into r from app_auth.resolve_public_caller('pk_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', 'https://b.example.com', 'EG');
  if r.brand_id is not null then
    raise exception 'CRITICAL: brand A''s key resolved from brand B''s origin (to %) — a caller can write into another brand', r.brand_id;
  end if;

  -- One origin on both brands: each key still resolves to its OWN brand, never the other.
  select * into r from app_auth.resolve_public_caller('pk_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', 'https://shared.example.com', 'EG');
  if r.brand_id is distinct from '00000000-0000-0000-0000-00000000000a'::uuid then
    raise exception 'CRITICAL: on a shared origin, brand A''s key resolved to %', r.brand_id;
  end if;
  select * into r from app_auth.resolve_public_caller('pk_BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB', 'https://shared.example.com', 'EG');
  if r.brand_id is distinct from '00000000-0000-0000-0000-00000000000b'::uuid then
    raise exception 'CRITICAL: on a shared origin, brand B''s key resolved to %', r.brand_id;
  end if;

  -- The market is named, never guessed: a market the origin isn't listed on resolves to nothing,
  -- and a dormant market takes no traffic even from its own origin.
  select * into r from app_auth.resolve_public_caller('pk_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', 'https://shared.example.com', 'SA');
  if r.brand_id is not null then raise exception 'CRITICAL: an origin resolved for a market it is not listed on'; end if;
  select * into r from app_auth.resolve_public_caller('pk_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', 'https://a.example.com', 'SA');
  if r.brand_id is not null then raise exception 'CRITICAL: a dormant market accepted public traffic'; end if;

  select * into r from app_auth.resolve_public_caller('pk_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', 'https://evil.example.net', 'EG');
  if r.brand_id is not null then raise exception 'CRITICAL: an unlisted origin resolved to a brand'; end if;
  select * into r from app_auth.resolve_public_caller('pk_ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ', 'https://a.example.com', 'EG');
  if r.brand_id is not null then raise exception 'CRITICAL: an unknown key resolved to a brand'; end if;

  raise notice 'PASS: a caller resolves only to its own brand, for a named live market listing its origin';
end $$;

-- ---- 2. a revoked key, or a paused brand, stops resolving at once ----
reset role;
update public.brand_publishable_keys set revoked_at = now() where key = 'pk_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
set local role service_role;
do $$
begin
  if exists (select 1 from app_auth.resolve_public_caller('pk_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', 'https://a.example.com', 'EG')) then
    raise exception 'CRITICAL: a revoked key still resolves';
  end if;
end $$;
reset role;
update public.brand_publishable_keys set revoked_at = null where key = 'pk_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
update public.brands set status = 'paused' where id = '00000000-0000-0000-0000-00000000000a';
set local role service_role;
do $$
begin
  if exists (select 1 from app_auth.resolve_public_caller('pk_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', 'https://a.example.com', 'EG')) then
    raise exception 'CRITICAL: a paused brand still accepts public writes';
  end if;
  raise notice 'PASS: a revoked key and a paused brand both stop resolving';
end $$;
reset role;
update public.brands set status = 'live' where id = '00000000-0000-0000-0000-00000000000a';
set local role service_role;

-- ---- 3. issuing keys, as the service role ----
do $$
declare k text;
begin
  k := public.issue_publishable_key('00000000-0000-0000-0000-00000000000b', 'test');
  if k !~ '^pk_[A-Za-z0-9]{32}$' then raise exception 'FAIL: issued key has the wrong shape (%)', k; end if;
  if k = public.issue_publishable_key('00000000-0000-0000-0000-00000000000b') then
    raise exception 'CRITICAL: two issued keys were identical';
  end if;
  raise notice 'PASS: the service role issues well-formed, distinct keys';
end $$;

-- ---- 4. rate limit, as the service role: exactly the limit per bucket, per window ----
do $$
declare i int;
begin
  for i in 1..3 loop
    if not app_auth.take_rate_limit('lead:a:client1', 3, 60) then raise exception 'FAIL: hit % of 3 was refused', i; end if;
  end loop;
  if app_auth.take_rate_limit('lead:a:client1', 3, 60) then
    raise exception 'CRITICAL: the 4th hit in a window of 3 was allowed';
  end if;
  if not app_auth.take_rate_limit('lead:a:client2', 3, 60) then
    raise exception 'FAIL: one client''s limit spilled over onto another';
  end if;
  raise notice 'PASS: the rate limit allows exactly its limit per bucket';
end $$;

-- ---- 5. a brand reads its own keys only, and cannot write, resolve or rate-limit ----
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
do $$
declare n int; msg text;
begin
  select count(*) into n from public.brand_publishable_keys where brand_id = '00000000-0000-0000-0000-00000000000b';
  if n <> 0 then raise exception 'CRITICAL: brand A reads brand B''s publishable keys (got %)', n; end if;
  select count(*) into n from public.brand_publishable_keys where brand_id = '00000000-0000-0000-0000-00000000000a';
  if n <> 1 then raise exception 'FAIL: brand A should read its own key (got %)', n; end if;

  msg := test_helpers.try($q$insert into public.brand_publishable_keys (brand_id, key)
    values ('00000000-0000-0000-0000-00000000000a', 'pk_CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC')$q$);
  if msg not like '%permission denied%' then raise exception 'CRITICAL: a brand user minted a key (%)', msg; end if;
  msg := test_helpers.try($q$update public.brand_publishable_keys set revoked_at = null$q$);
  if msg not like '%permission denied%' then raise exception 'CRITICAL: a brand user un-revoked a key (%)', msg; end if;
  msg := test_helpers.try($q$update public.brand_markets set allowed_origins = '{https://evil.example.net}'$q$);
  if msg not like '%permission denied%' then raise exception 'CRITICAL: a brand user edited an origin allowlist (%)', msg; end if;
  msg := test_helpers.try($q$select public.issue_publishable_key('00000000-0000-0000-0000-00000000000a')$q$);
  if msg not like '%permission denied%' then raise exception 'CRITICAL: a brand user issued a key (%)', msg; end if;
  msg := test_helpers.try($q$select * from app_auth.resolve_public_caller('pk_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', 'https://a.example.com', 'EG')$q$);
  if msg not like '%permission denied%' then raise exception 'CRITICAL: a brand user can call the resolver directly (%)', msg; end if;
  msg := test_helpers.try($q$select app_auth.take_rate_limit('x', 1, 60)$q$);
  if msg not like '%permission denied%' then raise exception 'CRITICAL: a brand user can touch the rate limiter (%)', msg; end if;
  raise notice 'PASS: a brand reads only its own keys and cannot mint, revoke, re-allow, resolve or rate-limit';
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
do $$
declare n int;
begin
  select count(*) into n from public.brand_publishable_keys;
  if n <> 4 then raise exception 'FAIL: ops staff should see all 4 keys (got %)', n; end if;
  raise notice 'PASS: staff see every brand''s keys';
end $$;

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$
declare n int; msg text;
begin
  select count(*) into n from public.brand_publishable_keys;
  if n <> 0 then raise exception 'CRITICAL: anon lists publishable keys (got %)', n; end if;
  msg := test_helpers.try($q$select * from app_auth.resolve_public_caller('pk_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', 'https://a.example.com', 'EG')$q$);
  if msg not like '%permission denied%' then raise exception 'CRITICAL: anon can call the resolver directly (%)', msg; end if;
  msg := test_helpers.try($q$select app_auth.take_rate_limit('x', 1, 60)$q$);
  if msg not like '%permission denied%' then raise exception 'CRITICAL: anon can touch the rate limiter (%)', msg; end if;
  msg := test_helpers.try($q$select count(*) from app_auth.rate_limit_hits$q$);
  if msg not like '%permission denied%' then raise exception 'CRITICAL: anon reads the rate-limit table (%)', msg; end if;
  raise notice 'PASS: anon lists no keys and reaches neither helper';
end $$;

rollback;
