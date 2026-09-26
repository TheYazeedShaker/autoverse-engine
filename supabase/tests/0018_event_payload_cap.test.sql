-- 0018_event_payload_cap.test.sql
-- MANDATORY test for migration 20260925140000_event_payload_cap.sql (BLOCK finding #9).
-- Proves: the events table holds 8192 bytes of payload and refuses 8193, whoever writes (the
-- owner role here bypasses RLS, as the worker's replays do); ingest_events_public refuses a batch
-- holding an oversized payload, as an accepted event or as a reject, or an event oversized as a
-- whole in any field, and writes NOTHING, to events or to event_dlq; the refusal still spends
-- rate-limit budget; an ordinary malformed event is still dead-lettered; an ordinary batch lands.

begin;

create schema test_helpers;
grant usage on schema test_helpers to anon, authenticated, service_role;
create function test_helpers.try(stmt text) returns text language plpgsql as $$
begin
  execute stmt;
  return '';
exception when others then
  return sqlstate || ': ' || sqlerrm;
end $$;
-- A payload whose rendering, {"x": "aaa…"}, is exactly `bytes` long.
create function test_helpers.payload(bytes int) returns jsonb language sql as $$
  select jsonb_build_object('x', repeat('a', bytes - 9));
$$;
grant execute on all functions in schema test_helpers to anon;

insert into public.brands (id, slug, name, status) values
  ('00000000-0000-0000-0000-00000000000a', 'brand-a', 'Brand A', 'live');
insert into public.brand_markets (brand_id, market_code, currency, locale, live, allowed_origins) values
  ('00000000-0000-0000-0000-00000000000a', 'EG', 'EGP', 'ar-EG', true, '{https://a.example.com}');
insert into public.brand_publishable_keys (brand_id, key) values
  ('00000000-0000-0000-0000-00000000000a', 'pk_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
select vault.create_secret('gw-test-secret', 'capture_gateway_secret');

-- ---- 0. the fixture measures what it claims ----
do $$
begin
  if octet_length(test_helpers.payload(8192)::text) <> 8192 then
    raise exception 'fixture: payload(8192) renders as % bytes', octet_length(test_helpers.payload(8192)::text);
  end if;
end $$;

-- ---- 1. the table: 8192 bytes fit, 8193 don't, for any writer ----
do $$
declare err text;
begin
  err := test_helpers.try($q$insert into public.events (id, brand_id, kind, payload)
    values ('00000000-0000-0000-0000-0000000e0001', '00000000-0000-0000-0000-00000000000a', 'x', test_helpers.payload(8192))$q$);
  if err <> '' then raise exception 'FAIL: a payload of exactly 8192 bytes was refused: %', err; end if;

  err := test_helpers.try($q$insert into public.events (id, brand_id, kind, payload)
    values ('00000000-0000-0000-0000-0000000e0002', '00000000-0000-0000-0000-00000000000a', 'x', test_helpers.payload(8193))$q$);
  if err = '' then raise exception 'CRITICAL: an 8193-byte payload was stored in the write-once events table'; end if;
  if err not like '23514:%events_payload_size%' then
    raise exception 'expected events_payload_size to refuse it, got: %', err;
  end if;
  raise notice 'PASS: events holds 8192 bytes of payload and refuses 8193, RLS bypassed or not';
end $$;

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

-- ---- 2. an oversized ACCEPTED event refuses the whole batch, and nothing is written ----
do $$
declare r jsonb; before_hits bigint; after_hits bigint;
begin
  reset role;
  select coalesce(sum(hits), 0) into before_hits from app_auth.rate_limit_hits;
  set local role anon;

  r := public.ingest_events_public('gw-test-secret', 'pk_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'https://a.example.com', 'EG', repeat('c', 32),
    jsonb_build_array(
      jsonb_build_object('id', '00000000-0000-0000-0000-0000000e0101', 'kind', 'ok.small'),
      jsonb_build_object('id', '00000000-0000-0000-0000-0000000e0102', 'kind', 'too.big',
                         'payload', test_helpers.payload(8193))));
  if r ->> 'refused' is distinct from 'payload_too_large' then
    raise exception 'CRITICAL: a batch with an oversized payload was not refused (%)', r;
  end if;

  reset role;
  if exists (select 1 from public.events where id in ('00000000-0000-0000-0000-0000000e0101', '00000000-0000-0000-0000-0000000e0102')) then
    raise exception 'CRITICAL: a refused batch wrote to events';
  end if;
  if exists (select 1 from public.event_dlq) then
    raise exception 'CRITICAL: an oversized event was dead-lettered — it must be refused, not stored';
  end if;
  select coalesce(sum(hits), 0) into after_hits from app_auth.rate_limit_hits;
  if after_hits <= before_hits then
    raise exception 'CRITICAL: a refused batch spent no rate-limit budget (% -> %)', before_hits, after_hits;
  end if;
  set local role anon;
  raise notice 'PASS: an oversized payload refuses the batch, writes nothing, and still counts';
end $$;

-- ---- 3. the same when the oversized event arrives as an edge reject ----
do $$
declare r jsonb;
begin
  r := public.ingest_events_public('gw-test-secret', 'pk_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'https://a.example.com', 'EG', repeat('c', 32), '[]'::jsonb,
    jsonb_build_array(jsonb_build_object(
      'source_payload', jsonb_build_object('id', 'not-a-uuid', 'payload', test_helpers.payload(9000)),
      'error_message', 'id: invalid')));
  if r ->> 'refused' is distinct from 'payload_too_large' then
    raise exception 'CRITICAL: an oversized reject was not refused (%)', r;
  end if;
  reset role;
  if exists (select 1 from public.event_dlq) then
    raise exception 'CRITICAL: an oversized reject was dead-lettered';
  end if;
  set local role anon;
  raise notice 'PASS: an oversized reject is refused too, never dead-lettered';
end $$;

-- ---- 3b. a reject whose bulk sits outside `payload`, or a bare string, is refused too ----
do $$
declare r jsonb; bad jsonb;
begin
  foreach bad in array array[
    jsonb_build_object('source_payload', jsonb_build_object('id', 'not-a-uuid', 'junk', repeat('j', 20000)),
                       'error_message', 'id: invalid'),
    jsonb_build_object('source_payload', to_jsonb(repeat('s', 20000)), 'error_message', '(root): not an object')
  ] loop
    r := public.ingest_events_public('gw-test-secret', 'pk_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      'https://a.example.com', 'EG', repeat('c', 32), '[]'::jsonb, jsonb_build_array(bad));
    if r ->> 'refused' is distinct from 'payload_too_large' then
      raise exception 'CRITICAL: an oversized reject (bulk outside payload) was not refused (%)', r;
    end if;
  end loop;
  reset role;
  if exists (select 1 from public.event_dlq) then
    raise exception 'CRITICAL: an oversized reject was dead-lettered through a field other than payload';
  end if;
  set local role anon;
  raise notice 'PASS: an event oversized as a whole is refused, whichever field holds the bulk';
end $$;

-- ---- 3c. regression: an ordinary malformed event is still dead-lettered, not refused ----
do $$
declare r jsonb;
begin
  r := public.ingest_events_public('gw-test-secret', 'pk_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'https://a.example.com', 'EG', repeat('c', 32), '[]'::jsonb,
    jsonb_build_array(jsonb_build_object(
      'source_payload', jsonb_build_object('id', 'not-a-uuid', 'kind', 'x', 'payload', test_helpers.payload(100)),
      'error_message', 'id: invalid')));
  if r ? 'refused' or (r ->> 'dead_lettered')::int <> 1 then
    raise exception 'FAIL: a small malformed event was not dead-lettered as before (%)', r;
  end if;
  reset role;
  if (select count(*) from public.event_dlq) <> 1 then
    raise exception 'FAIL: the small malformed event is not in event_dlq';
  end if;
  set local role anon;
  raise notice 'PASS: an ordinary malformed event is still dead-lettered';
end $$;

-- ---- 4. an ordinary batch, right up to the limit, still lands ----
do $$
declare r jsonb;
begin
  r := public.ingest_events_public('gw-test-secret', 'pk_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'https://a.example.com', 'EG', repeat('d', 32),
    jsonb_build_array(jsonb_build_object('id', '00000000-0000-0000-0000-0000000e0201', 'kind', 'at.limit',
                                         'payload', test_helpers.payload(8192))));
  if (r ->> 'accepted')::int <> 1 or r ? 'refused' then
    raise exception 'FAIL: an 8192-byte payload was not accepted (%)', r;
  end if;
  reset role;
  if not exists (select 1 from public.events where id = '00000000-0000-0000-0000-0000000e0201') then
    raise exception 'FAIL: the accepted event is not in events';
  end if;
  raise notice 'PASS: a payload at the limit is stored';
end $$;

rollback;
