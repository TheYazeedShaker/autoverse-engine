-- 0014_caller_auth_foundation.test.sql
-- MANDATORY isolation test for migration 20260924170000_caller_auth_foundation.sql.
-- Proves: a public caller resolves to a brand ONLY with a live key AND an origin on that same
-- brand's allowlist AND a live market, so brand A's key from brand B's site resolves to nothing;
-- a revoked key stops working; a brand reads its own publishable keys and nobody else's; nobody but
-- the service role writes keys or calls the helpers; and the rate limit cuts off at its limit per
-- bucket.

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
insert into public.brands (id, slug, name) values
  ('00000000-0000-0000-0000-00000000000a', 'brand-a', 'Brand A'),
  ('00000000-0000-0000-0000-00000000000b', 'brand-b', 'Brand B');
insert into public.profiles (id, brand_id, brand_role, platform_role) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', 'brand_admin', null),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000b', 'brand_admin', null),
  ('00000000-0000-0000-0000-0000000000c1', null, null, 'ops');
insert into public.brand_markets (brand_id, market_code, currency, locale, live, allowed_origins) values
  ('00000000-0000-0000-0000-00000000000a', 'EG', 'EGP', 'ar-EG', true,  '{https://a.example.com}'),
  ('00000000-0000-0000-0000-00000000000a', 'SA', 'SAR', 'ar-SA', false, '{https://a-sa.example.com}'),
  ('00000000-0000-0000-0000-00000000000b', 'EG', 'EGP', 'ar-EG', true,  '{https://b.example.com}');

insert into public.brand_publishable_keys (brand_id, key) values
  ('00000000-0000-0000-0000-00000000000a', 'pk_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'),
  ('00000000-0000-0000-0000-00000000000b', 'pk_BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB');

-- ---- 1. key + origin + live market, all from the same brand, or nothing ----
do $$
declare r record;
begin
  select * into r from app_auth.resolve_public_caller('pk_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', 'https://a.example.com');
  if r.brand_id is distinct from '00000000-0000-0000-0000-00000000000a'::uuid or r.market_code <> 'EG' then
    raise exception 'FAIL: a valid key from an allowed origin did not resolve to its brand (%)', r;
  end if;

  -- The origin header is case-insensitive in the host part; the stored form is lower-case.
  select * into r from app_auth.resolve_public_caller('pk_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', 'https://A.EXAMPLE.COM');
  if r.brand_id is null then raise exception 'FAIL: an upper-case origin did not match'; end if;

  -- Brand A's key, sent from brand B's site: someone lifted it. It must resolve to NOTHING.
  select * into r from app_auth.resolve_public_caller('pk_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', 'https://b.example.com');
  if r.brand_id is not null then
    raise exception 'CRITICAL: brand A''s key resolved from brand B''s origin (to %) — a caller can write into another brand', r.brand_id;
  end if;

  -- An origin nobody allowed.
  select * into r from app_auth.resolve_public_caller('pk_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', 'https://evil.example.net');
  if r.brand_id is not null then raise exception 'CRITICAL: an unlisted origin resolved to a brand'; end if;

  -- A market that isn't live takes no traffic, even from its own origin.
  select * into r from app_auth.resolve_public_caller('pk_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', 'https://a-sa.example.com');
  if r.brand_id is not null then raise exception 'CRITICAL: a dormant market accepted public traffic'; end if;

  -- A made-up key.
  select * into r from app_auth.resolve_public_caller('pk_ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ', 'https://a.example.com');
  if r.brand_id is not null then raise exception 'CRITICAL: an unknown key resolved to a brand'; end if;

  raise notice 'PASS: a caller resolves only with its own brand''s live key, allowed origin and live market';
end $$;

-- ---- 2. a revoked key stops working at once ----
do $$
declare r record;
begin
  update public.brand_publishable_keys set revoked_at = now() where key = 'pk_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
  select * into r from app_auth.resolve_public_caller('pk_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', 'https://a.example.com');
  if r.brand_id is not null then raise exception 'CRITICAL: a revoked key still resolves'; end if;
  update public.brand_publishable_keys set revoked_at = null where key = 'pk_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
  raise notice 'PASS: a revoked key stops resolving';
end $$;

-- ---- 3. the data is well-formed by construction ----
do $$
declare msg text; k text;
begin
  msg := test_helpers.try($q$update public.brand_markets set allowed_origins = '{https://a.example.com/path}'
    where brand_id = '00000000-0000-0000-0000-00000000000a' and market_code = 'EG'$q$);
  if msg not like '%brand_markets_allowed_origins_valid%' then
    raise exception 'FAIL: an origin with a path was stored (%)', msg;
  end if;
  msg := test_helpers.try($q$update public.brand_markets set allowed_origins = '{http://a.example.com}'
    where brand_id = '00000000-0000-0000-0000-00000000000a' and market_code = 'EG'$q$);
  if msg not like '%brand_markets_allowed_origins_valid%' then
    raise exception 'CRITICAL: a plain-http production origin was allowed (%)', msg;
  end if;
  msg := test_helpers.try($q$insert into public.brand_publishable_keys (brand_id, key)
    values ('00000000-0000-0000-0000-00000000000a', 'short')$q$);
  if msg not like '%brand_publishable_keys_format%' then
    raise exception 'FAIL: a malformed key was stored (%)', msg;
  end if;

  k := public.issue_publishable_key('00000000-0000-0000-0000-00000000000b', 'test');
  if k !~ '^pk_[A-Za-z0-9]{32}$' then raise exception 'FAIL: issued key has the wrong shape (%)', k; end if;
  if k = public.issue_publishable_key('00000000-0000-0000-0000-00000000000b') then
    raise exception 'CRITICAL: two issued keys were identical';
  end if;
  raise notice 'PASS: origins, keys and issued keys are well-formed';
end $$;

-- ---- 4. rate limit: exactly the limit per bucket, per window ----
do $$
declare i int; ok boolean;
begin
  for i in 1..3 loop
    ok := app_auth.take_rate_limit('lead:a:client1', 3, 60);
    if not ok then raise exception 'FAIL: hit % of 3 was refused', i; end if;
  end loop;
  if app_auth.take_rate_limit('lead:a:client1', 3, 60) then
    raise exception 'CRITICAL: the 4th hit in a window of 3 was allowed';
  end if;
  if not app_auth.take_rate_limit('lead:a:client2', 3, 60) then
    raise exception 'FAIL: one client''s limit spilled over onto another';
  end if;
  raise notice 'PASS: the rate limit allows exactly its limit per bucket';
end $$;

-- ---- 5. a brand reads its own keys only, and nobody but the service role writes or resolves ----
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
  msg := test_helpers.try($q$select * from app_auth.resolve_public_caller('pk_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', 'https://a.example.com')$q$);
  if msg not like '%permission denied%' then raise exception 'CRITICAL: a brand user can call the resolver directly (%)', msg; end if;
  msg := test_helpers.try($q$select app_auth.take_rate_limit('x', 1, 60)$q$);
  if msg not like '%permission denied%' then raise exception 'CRITICAL: a brand user can touch the rate limiter (%)', msg; end if;
  raise notice 'PASS: a brand reads only its own keys and cannot mint, revoke, re-allow or resolve';
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
do $$
begin
  if (select count(*) from public.brand_publishable_keys) < 2 then
    raise exception 'FAIL: ops staff should see every brand''s keys';
  end if;
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
  msg := test_helpers.try($q$select * from app_auth.resolve_public_caller('pk_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', 'https://a.example.com')$q$);
  if msg not like '%permission denied%' then raise exception 'CRITICAL: anon can call the resolver directly (%)', msg; end if;
  msg := test_helpers.try($q$select count(*) from app_auth.rate_limit_hits$q$);
  if msg not like '%permission denied%' then raise exception 'CRITICAL: anon reads the rate-limit table (%)', msg; end if;
  raise notice 'PASS: anon lists no keys and reaches neither helper';
end $$;

rollback;
