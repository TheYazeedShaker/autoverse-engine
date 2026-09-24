-- 0016_public_capture_rpcs.test.sql
-- MANDATORY isolation test for migration 20260924190000_public_capture_rpcs.sql.
-- Owner's requirement: "calling them with brand A's key must never be able to write brand B's rows."
-- Proves, calling AS anon (the only role granted): brand A's key writes only into brand A, even
-- when the body names brand B or brand B's model; brand A's key from brand B's origin writes
-- nothing; a direct call without the gateway secret writes nothing; the per-client rate limit cuts
-- in; a sender's mistake is refused, not dead-lettered; and anon still reaches nothing else.

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

insert into public.brands (id, slug, name, status) values
  ('00000000-0000-0000-0000-00000000000a', 'brand-a', 'Brand A', 'live'),
  ('00000000-0000-0000-0000-00000000000b', 'brand-b', 'Brand B', 'live');
insert into public.brand_markets (brand_id, market_code, currency, locale, live, allowed_origins) values
  ('00000000-0000-0000-0000-00000000000a', 'EG', 'EGP', 'ar-EG', true, '{https://a.example.com}'),
  ('00000000-0000-0000-0000-00000000000b', 'EG', 'EGP', 'ar-EG', true, '{https://b.example.com}');
insert into public.brand_publishable_keys (brand_id, key) values
  ('00000000-0000-0000-0000-00000000000a', 'pk_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'),
  ('00000000-0000-0000-0000-00000000000b', 'pk_BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB');
insert into public.models (id, brand_id, slug, name_en, name_ar) values
  ('00000000-0000-0000-0000-0000000000bb', '00000000-0000-0000-0000-00000000000b', 'b-model', 'B Model', 'B Model');
select vault.create_secret('gw-test-secret', 'capture_gateway_secret');

create function test_helpers.lead(submission text, extra jsonb default '{}') returns jsonb language sql as $$
  select jsonb_build_object(
    'full_name', 'Fatma Hassan', 'phone', '+201000000001',
    'consent_text_version', 'eg-v1', 'consent_at', now()::text,
    'submission_id', submission) || extra;
$$;

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

-- ---- 1. brand A's key writes into brand A only, whatever the body claims ----
do $$
declare r jsonb;
begin
  r := public.capture_lead_public('gw-test-secret', 'pk_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', 'https://a.example.com', 'EG',
    repeat('a', 32), test_helpers.lead('00000000-0000-0000-0000-00000000f001',
      '{"brand_id": "00000000-0000-0000-0000-00000000000b", "market_code": "SA"}'));
  if r ->> 'status' <> 'captured' then raise exception 'FAIL: a valid lead was not captured (%)', r; end if;
  if r ? 'lead_id' then raise exception 'FAIL: an anonymous caller was handed a lead id'; end if;

  r := public.ingest_events_public('gw-test-secret', 'pk_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', 'https://a.example.com', 'EG',
    repeat('a', 32),
    '[{"id": "00000000-0000-0000-0000-00000000e101", "kind": "configurator.opened", "brand_id": "00000000-0000-0000-0000-00000000000b"},
      {"id": "00000000-0000-0000-0000-00000000e102", "kind": "configurator.opened", "model_id": "00000000-0000-0000-0000-0000000000bb"}]'::jsonb);
  if (r ->> 'accepted')::int <> 1 or (r ->> 'dead_lettered')::int <> 1 then
    raise exception 'FAIL: expected 1 accepted + 1 dead-lettered (brand B''s model), got %', r;
  end if;
  raise notice 'PASS: brand A''s key captured a lead and an event';
end $$;

-- ---- 2. brand A's key from brand B's origin, or with no gateway secret: nothing ----
do $$
declare msg text;
begin
  msg := test_helpers.try($q$select public.capture_lead_public('gw-test-secret', 'pk_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'https://b.example.com', 'EG', repeat('a', 32), test_helpers.lead('00000000-0000-0000-0000-00000000f002'))$q$);
  if msg not like '%not authorized%' then raise exception 'CRITICAL: brand A''s key was accepted from brand B''s origin (%)', msg; end if;

  msg := test_helpers.try($q$select public.ingest_events_public('gw-test-secret', 'pk_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'https://b.example.com', 'EG', repeat('a', 32), '[{"id": "00000000-0000-0000-0000-00000000e103", "kind": "x"}]')$q$);
  if msg not like '%not authorized%' then raise exception 'CRITICAL: brand A''s key ingested from brand B''s origin (%)', msg; end if;

  -- Straight at the RPC with the public anon key, skipping the edge function and its bot check.
  msg := test_helpers.try($q$select public.capture_lead_public(null, 'pk_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'https://a.example.com', 'EG', repeat('a', 32), test_helpers.lead('00000000-0000-0000-0000-00000000f003'))$q$);
  if msg not like '%not authorized%' then raise exception 'CRITICAL: a direct call without the gateway secret was accepted (%)', msg; end if;
  msg := test_helpers.try($q$select public.capture_lead_public('guess', 'pk_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'https://a.example.com', 'EG', repeat('a', 32), test_helpers.lead('00000000-0000-0000-0000-00000000f004'))$q$);
  if msg not like '%not authorized%' then raise exception 'CRITICAL: a wrong gateway secret was accepted (%)', msg; end if;
  raise notice 'PASS: a foreign origin or a missing gateway secret writes nothing';
end $$;

-- ---- 3. a sender's mistake is refused, not dead-lettered, and still counts against the limit ----
do $$
declare r jsonb; i int; msg text;
begin
  r := public.capture_lead_public('gw-test-secret', 'pk_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'https://a.example.com', 'EG', repeat('b', 32), test_helpers.lead('00000000-0000-0000-0000-00000000f005') - 'consent_text_version');
  if r ->> 'status' <> 'rejected' or r ->> 'code' <> '23514' then
    raise exception 'FAIL: a lead without consent was not refused as the sender''s mistake (%)', r;
  end if;

  -- Four more refused attempts from the same client use up its 5, so the 6th is rate limited.
  -- If a refusal rolled its hit back, failed attempts would be free and this would not trip.
  for i in 1..4 loop
    perform public.capture_lead_public('gw-test-secret', 'pk_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      'https://a.example.com', 'EG', repeat('b', 32), test_helpers.lead('00000000-0000-0000-0000-00000000f005') - 'consent_text_version');
  end loop;
  msg := test_helpers.try($q$select public.capture_lead_public('gw-test-secret', 'pk_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'https://a.example.com', 'EG', repeat('b', 32), test_helpers.lead('00000000-0000-0000-0000-00000000f006'))$q$);
  if msg not like '%rate limited%' then
    raise exception 'CRITICAL: refused attempts did not count against the rate limit (%)', msg;
  end if;
  if exists (select 1 from public.lead_dlq) then raise exception 'FAIL: a sender''s mistake was dead-lettered'; end if;
  raise notice 'PASS: a sender''s mistake is refused (not dead-lettered) and still spends rate-limit budget';
end $$;

-- ---- 3b. event limits count events, not calls ----
do $$
declare junk jsonb; msg text; i int;
begin
  select jsonb_agg(jsonb_build_object('source_payload', jsonb_build_object('n', g), 'error_message', 'test'))
    into junk from generate_series(1, 100) g;
  for i in 1..3 loop  -- 3 calls x 100 events = the client's 300 per minute
    perform public.ingest_events_public('gw-test-secret', 'pk_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      'https://a.example.com', 'EG', repeat('e', 32), '[]'::jsonb, junk);
  end loop;
  msg := test_helpers.try(format($q$select public.ingest_events_public('gw-test-secret', 'pk_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'https://a.example.com', 'EG', repeat('e', 32), '[{"id": "00000000-0000-0000-0000-00000000e199", "kind": "x"}]'::jsonb)$q$));
  if msg not like '%rate limited%' then
    raise exception 'CRITICAL: a client wrote past 300 events a minute by batching (%)', msg;
  end if;
  raise notice 'PASS: event limits are counted per event, so batching can''t multiply them';
end $$;

-- ---- 4. the per-client rate limit cuts in ----
do $$
declare msg text; i int;
begin
  for i in 1..4 loop  -- client 'aaa…' already used one lead in section 1
    perform public.capture_lead_public('gw-test-secret', 'pk_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', 'https://a.example.com', 'EG',
      repeat('a', 32), test_helpers.lead(format('00000000-0000-0000-0000-0000000f%s', lpad(i::text, 4, '0'))));
  end loop;
  msg := test_helpers.try($q$select public.capture_lead_public('gw-test-secret', 'pk_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'https://a.example.com', 'EG', repeat('a', 32), test_helpers.lead('00000000-0000-0000-0000-00000000f099'))$q$);
  if msg not like '%rate limited%' then raise exception 'CRITICAL: the 6th lead from one client in 10 minutes was accepted (%)', msg; end if;
  msg := test_helpers.try($q$select public.capture_lead_public('gw-test-secret', 'pk_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'https://a.example.com', 'EG', 'not-an-hmac', test_helpers.lead('00000000-0000-0000-0000-00000000f098'))$q$);
  if msg not like '%client id%' then raise exception 'FAIL: a malformed client id was accepted (%)', msg; end if;
  raise notice 'PASS: the per-client limit refuses the 6th lead in the window';
end $$;

-- ---- 5. anon still reaches nothing else ----
do $$
declare msg text;
begin
  msg := test_helpers.try($q$select public.capture_lead('{}'::jsonb)$q$);
  if msg not like '%permission denied%' then raise exception 'CRITICAL: anon can call capture_lead directly (%)', msg; end if;
  msg := test_helpers.try($q$select * from app_auth.admit_public_call('gw-test-secret','x','x','EG',repeat('a',32),'lead',1,1,60)$q$);
  if msg not like '%permission denied%' then raise exception 'CRITICAL: anon can call the admission gate directly (%)', msg; end if;
  msg := test_helpers.try($q$select count(*) from app_auth.rate_limit_hits$q$);
  if msg not like '%permission denied%' then raise exception 'CRITICAL: anon reads the rate-limit table (%)', msg; end if;
  msg := test_helpers.try($q$select count(*) from vault.decrypted_secrets$q$);
  if msg not like '%permission denied%' then raise exception 'CRITICAL: anon reads Vault (%)', msg; end if;
  if (select count(*) from public.leads) <> 0 or (select count(*) from public.events) <> 0 then
    raise exception 'CRITICAL: anon can read leads or events';
  end if;
  raise notice 'PASS: anon reaches only the two public RPCs';
end $$;

-- ---- 5b. the catalogue agrees: anon can execute no other SECURITY DEFINER function that can write ----
-- (Stable/immutable helpers such as app_auth.current_brand_id() are read-only and must stay
-- callable: RLS policies evaluate them for every role.)
reset role;
do $$
declare leaked text;
begin
  select string_agg(n.nspname || '.' || p.proname, ', ') into leaked
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where p.prosecdef
     and p.provolatile = 'v'
     and p.prorettype <> 'trigger'::regtype  -- trigger functions can't be called directly
     and n.nspname in ('public', 'app_auth')
     and has_function_privilege('anon', p.oid, 'EXECUTE')
     and p.proname not in ('capture_lead_public', 'ingest_events_public');
  if leaked is not null then
    raise exception 'CRITICAL: anon can execute SECURITY DEFINER function(s): %', leaked;
  end if;
  raise notice 'PASS: the only writing SECURITY DEFINER functions anon can execute are the two public RPCs';
end $$;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

-- ---- 6. the rows, checked as the owner: brand B received nothing at all ----
reset role;
do $$
begin
  if exists (select 1 from public.leads where brand_id = '00000000-0000-0000-0000-00000000000b')
     or exists (select 1 from public.events where brand_id = '00000000-0000-0000-0000-00000000000b')
     or exists (select 1 from public.lead_dlq where source_payload ->> 'brand_id' = '00000000-0000-0000-0000-00000000000b')
     or exists (select 1 from public.event_dlq where source_payload ->> 'brand_id' = '00000000-0000-0000-0000-00000000000b') then
    raise exception 'CRITICAL: brand A''s key wrote a row for brand B';
  end if;
  if (select count(*) from public.leads where brand_id = '00000000-0000-0000-0000-00000000000a' and market_code = 'EG') <> 5 then
    raise exception 'FAIL: expected brand A''s 5 admitted leads, in its resolved market';
  end if;
  if not exists (select 1 from public.events where id = '00000000-0000-0000-0000-00000000e101'
                   and brand_id = '00000000-0000-0000-0000-00000000000a') then
    raise exception 'FAIL: the event that named brand B was not stored under brand A';
  end if;
  raise notice 'PASS: brand A''s key never wrote a single brand B row — leads, events or dead letters';
end $$;

-- ---- 7. authenticated users don't get the anon RPCs either ----
set local role authenticated;
do $$
declare msg text;
begin
  msg := test_helpers.try($q$select public.capture_lead_public('gw-test-secret','pk_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA','https://a.example.com','EG',repeat('c',32),'{}'::jsonb)$q$);
  if msg not like '%permission denied%' then raise exception 'FAIL: EXECUTE leaked to authenticated (%)', msg; end if;
  raise notice 'PASS: only anon holds EXECUTE on the public RPCs';
end $$;

rollback;
