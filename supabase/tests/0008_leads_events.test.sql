-- 0008_leads_events.test.sql
-- MANDATORY isolation test for migration 20260922232813_leads_events.sql (1·A Slice 5).
-- Proves: a lead cannot exist without consent; an audit trail cannot be rewritten or deleted by
-- anyone, service role included; a raw event is write-once and processed exactly once; a brand
-- reads only its own leads and events; NO consumer-facing read path exists for any of it; dead
-- letters are staff-only because they can hold another brand's payload.

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

-- ===== fixtures =====
insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000b1'),
  ('00000000-0000-0000-0000-0000000000c1'),
  ('00000000-0000-0000-0000-0000000000d1');

insert into public.brands (id, slug, name) values
  ('00000000-0000-0000-0000-00000000000a', 'brand-a', 'Brand A'),
  ('00000000-0000-0000-0000-00000000000b', 'brand-b', 'Brand B');

insert into public.profiles (id, brand_id, brand_role, platform_role) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', 'brand_admin', null),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000b', 'brand_admin', null),
  ('00000000-0000-0000-0000-0000000000c1', null, null, 'ops');

insert into public.brand_markets (brand_id, market_code, currency, locale, live) values
  ('00000000-0000-0000-0000-00000000000a', 'EG', 'EGP', 'ar-EG', true),
  ('00000000-0000-0000-0000-00000000000b', 'EG', 'EGP', 'ar-EG', true);

insert into public.leads (id, brand_id, market_code, full_name, phone, city, type, consent_text_version, consent_at, submission_id) values
  ('00000000-0000-0000-0000-0000000a7001', '00000000-0000-0000-0000-00000000000a', 'EG', 'Fatma Hassan', '+201000000001', 'Cairo', 'test_drive', 'eg-v1', now(), gen_random_uuid()),
  ('00000000-0000-0000-0000-0000000b7001', '00000000-0000-0000-0000-00000000000b', 'EG', 'Omar Adel',    '+201000000002', 'Giza',  'quote',      'eg-v1', now(), gen_random_uuid());

insert into public.lead_activities (id, brand_id, lead_id, actor_id, kind, payload) values
  ('00000000-0000-0000-0000-0000000a8001', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000a7001',
   '00000000-0000-0000-0000-0000000000a1', 'status_change', '{"from": "new", "to": "contacted"}'::jsonb);

insert into public.events (id, brand_id, market_code, kind, payload) values
  ('00000000-0000-0000-0000-0000000a9001', '00000000-0000-0000-0000-00000000000a', 'EG', 'configurator.opened', '{"model": "a-pub"}'::jsonb),
  ('00000000-0000-0000-0000-0000000b9001', '00000000-0000-0000-0000-00000000000b', 'EG', 'configurator.opened', '{}'::jsonb);

insert into public.event_dlq (source_payload, error_message, attempts) values
  ('{"id": "…", "kind": "configurator.opened"}'::jsonb, 'brand_id did not resolve', 1);
insert into public.lead_dlq (source_payload, error_message, attempts) values
  ('{"full_name": "…", "phone": "…"}'::jsonb, 'routing webhook timed out', 2);

-- ---- 1. consent is not optional, and a lead cannot be invented out of thin air ----
do $$
declare msg text;
begin
  msg := test_helpers.try($q$insert into public.leads (brand_id, market_code, full_name, phone, consent_at, submission_id)
    values ('00000000-0000-0000-0000-00000000000a', 'EG', 'No Consent', '+201000000003', now(), gen_random_uuid())$q$);
  if msg not like '%consent_text_version%' then
    raise exception 'CRITICAL: a lead was stored without the consent text version (%)', msg;
  end if;

  msg := test_helpers.try($q$insert into public.leads (brand_id, market_code, full_name, phone, consent_text_version, submission_id)
    values ('00000000-0000-0000-0000-00000000000a', 'EG', 'No Timestamp', '+201000000004', 'eg-v1', gen_random_uuid())$q$);
  if msg not like '%consent_at%' then
    raise exception 'CRITICAL: a lead was stored without the moment consent was given (%)', msg;
  end if;

  -- A blank name or phone is not a lead.
  msg := test_helpers.try($q$insert into public.leads (brand_id, market_code, full_name, phone, consent_text_version, consent_at, submission_id)
    values ('00000000-0000-0000-0000-00000000000a', 'EG', '   ', '+201000000005', 'eg-v1', now(), gen_random_uuid())$q$);
  if msg not like '%leads_full_name_present%' then
    raise exception 'FAIL: a lead was stored with a blank name (%)', msg;
  end if;

  -- A lead in a market the brand does not operate in.
  msg := test_helpers.try($q$insert into public.leads (brand_id, market_code, full_name, phone, consent_text_version, consent_at, submission_id)
    values ('00000000-0000-0000-0000-00000000000a', 'SA', 'Wrong Market', '+201000000006', 'eg-v1', now(), gen_random_uuid())$q$);
  if msg not like '%violates foreign key constraint%' then
    raise exception 'FAIL: a lead was stored for a market the brand has no presence in (%)', msg;
  end if;

  raise notice 'PASS: no lead exists without consent, a name and a phone, in a market the brand operates in';
end $$;

-- ---- 2. history cannot be rewritten — by anyone, service role included ----
do $$
declare msg text;
begin
  msg := test_helpers.try($q$update public.lead_activities set payload = '{"from": "new", "to": "won"}'::jsonb
    where id = '00000000-0000-0000-0000-0000000a8001'$q$);
  if msg not like '%append-only%' then
    raise exception 'CRITICAL: an audit trail entry was rewritten (%)', msg;
  end if;

  msg := test_helpers.try($q$delete from public.lead_activities where id = '00000000-0000-0000-0000-0000000a8001'$q$);
  if msg not like '%append-only%' then
    raise exception 'CRITICAL: an audit trail entry was deleted (%)', msg;
  end if;

  msg := test_helpers.try($q$delete from public.events where id = '00000000-0000-0000-0000-0000000a9001'$q$);
  if msg not like '%write-once%' then
    raise exception 'CRITICAL: a raw event was deleted — aggregates are no longer rebuildable (%)', msg;
  end if;

  msg := test_helpers.try($q$update public.events set payload = '{"tampered": true}'::jsonb
    where id = '00000000-0000-0000-0000-0000000a9001'$q$);
  if msg not like '%only processed_at may be set%' then
    raise exception 'CRITICAL: a raw event payload was edited (%)', msg;
  end if;

  -- Stamping processed_at is the one permitted change, and only once.
  msg := test_helpers.try($q$update public.events set processed_at = now()
    where id = '00000000-0000-0000-0000-0000000a9001'$q$);
  if msg <> '' then raise exception 'FAIL: an event could not be marked processed (%)', msg; end if;

  msg := test_helpers.try($q$update public.events set processed_at = now()
    where id = '00000000-0000-0000-0000-0000000a9001'$q$);
  if msg not like '%already been processed%' then
    raise exception 'CRITICAL: an event was processed twice (%)', msg;
  end if;

  raise notice 'PASS: events are write-once and processed once; the audit trail cannot be rewritten or deleted';
end $$;

-- ---- 3. the same event id arriving twice is a no-op, not a duplicate ----
do $$
declare n int; msg text;
begin
  msg := test_helpers.try($q$insert into public.events (id, brand_id, kind)
    values ('00000000-0000-0000-0000-0000000b9001', '00000000-0000-0000-0000-00000000000b', 'configurator.opened')
    on conflict (id) do nothing$q$);
  if msg <> '' then raise exception 'FAIL: a redelivered event was not absorbed (%)', msg; end if;
  select count(*) into n from public.events where id = '00000000-0000-0000-0000-0000000b9001';
  if n <> 1 then raise exception 'CRITICAL: at-least-once delivery produced % rows for one event', n; end if;
  raise notice 'PASS: a redelivered event is absorbed by its id, not duplicated';
end $$;

-- ---- 3b. redelivery of an event that has ALREADY BEEN PROCESSED ----
-- These are the two statements PostgREST can emit for an upsert on id. ingest-event must send the
-- first (services/ingest-event/upsert.test.ts checks that it does). The second is what a plain
-- `.upsert()` sends, and it is shown here failing, so the reason for the choice stays visible.
do $$
declare n int; msg text;
begin
  insert into public.events (id, brand_id, kind)
    values ('00000000-0000-0000-0000-0000000b9002', '00000000-0000-0000-0000-00000000000b', 'configurator.opened');
  update public.events set processed_at = now() where id = '00000000-0000-0000-0000-0000000b9002';

  msg := test_helpers.try($q$insert into public.events (id, brand_id, kind)
    values ('00000000-0000-0000-0000-0000000b9002', '00000000-0000-0000-0000-00000000000b', 'configurator.opened')
    on conflict (id) do nothing$q$);
  if msg <> '' then
    raise exception 'CRITICAL: redelivery of a processed event was refused under DO NOTHING (%)', msg;
  end if;
  select count(*) into n from public.events where id = '00000000-0000-0000-0000-0000000b9002';
  if n <> 1 then raise exception 'CRITICAL: redelivery produced % rows for one event', n; end if;

  msg := test_helpers.try($q$insert into public.events (id, brand_id, kind)
    values ('00000000-0000-0000-0000-0000000b9002', '00000000-0000-0000-0000-00000000000b', 'configurator.opened')
    on conflict (id) do update set brand_id = excluded.brand_id, kind = excluded.kind$q$);
  if msg not like '%already been processed%' then
    raise exception 'FAIL: expected DO UPDATE to hit the write-once guard, got (%)', msg;
  end if;
  raise notice 'PASS: a processed event redelivered with DO NOTHING is absorbed (DO UPDATE would be refused)';
end $$;

set local role authenticated;

-- ---- 4. a brand reads only its own leads, activities and events, and writes none ----
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
do $$
declare own int; other int; msg text;
begin
  select count(*) into other from public.leads where brand_id = '00000000-0000-0000-0000-00000000000b';
  if other <> 0 then raise exception 'CRITICAL: Brand A can read Brand B''s leads — that is another brand''s customer PII (got %)', other; end if;
  select count(*) into other from public.events where brand_id = '00000000-0000-0000-0000-00000000000b';
  if other <> 0 then raise exception 'CRITICAL: Brand A can read Brand B''s events (got %)', other; end if;

  select count(*) into own from public.leads;
  if own <> 1 then raise exception 'FAIL: Brand A should see its own lead (got %)', own; end if;
  select count(*) into own from public.lead_activities;
  if own <> 1 then raise exception 'FAIL: Brand A should see its own lead activity (got %)', own; end if;

  -- Dead letters are staff-only: a row can hold another brand's payload.
  select count(*) into own from public.lead_dlq;
  if own <> 0 then raise exception 'CRITICAL: a brand can read the lead dead-letter queue (got %)', own; end if;
  select count(*) into own from public.event_dlq;
  if own <> 0 then raise exception 'CRITICAL: a brand can read the event dead-letter queue (got %)', own; end if;

  msg := test_helpers.try($q$update public.leads set status = 'won' where brand_id = '00000000-0000-0000-0000-00000000000a'$q$);
  if msg not like '%permission denied%' and msg not like '%row-level security%' then
    if exists (select 1 from public.leads where status = 'won') then
      raise exception 'CRITICAL: a brand changed a lead status directly, with no activity trail';
    end if;
  end if;

  raise notice 'PASS: a brand reads its own leads and events only, writes none, and sees no dead letters';
end $$;

-- ---- 5. no consumer-facing read path exists at all ----
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true);
do $$
declare nl int; na int; ne int;
begin
  select count(*) into nl from public.leads;
  select count(*) into na from public.lead_activities;
  select count(*) into ne from public.events;
  if nl <> 0 or na <> 0 or ne <> 0 then
    raise exception 'CRITICAL: a signed-in end user can read leads %, activities %, events %', nl, na, ne;
  end if;
  raise notice 'PASS: a signed-in end user reads no leads, no activities and no events';
end $$;

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$
declare nl int; ne int; nd int;
begin
  select count(*) into nl from public.leads;
  select count(*) into ne from public.events;
  select count(*) into nd from public.lead_dlq;
  if nl <> 0 or ne <> 0 or nd <> 0 then
    raise exception 'CRITICAL: anon reads leads %, events %, dead letters %', nl, ne, nd;
  end if;
  raise notice 'PASS: anon reads nothing — the capture surface writes through an edge function only';
end $$;

-- ---- 6. staff see the operational surface; the service role writes it ----
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
do $$
declare n int;
begin
  select count(*) into n from public.leads;
  if n <> 2 then raise exception 'FAIL: ops staff should see both leads (got %)', n; end if;
  select count(*) into n from public.lead_dlq;
  if n <> 1 then raise exception 'FAIL: ops staff should see the lead dead letter (got %)', n; end if;
  select count(*) into n from public.event_dlq;
  if n <> 1 then raise exception 'FAIL: ops staff should see the event dead letter (got %)', n; end if;
  raise notice 'PASS: staff see leads and both dead-letter queues';
end $$;

reset role;
set local role service_role;
select set_config('request.jwt.claims', '', true);
do $$
declare n int; msg text;
begin
  msg := test_helpers.try($q$insert into public.leads (brand_id, market_code, full_name, phone, consent_text_version, consent_at, submission_id)
    values ('00000000-0000-0000-0000-00000000000a', 'EG', 'Via Edge Fn', '+201000000009', 'eg-v1', now(), gen_random_uuid())$q$);
  if msg <> '' then raise exception 'CRITICAL: the service role cannot capture a lead (%)', msg; end if;

  msg := test_helpers.try($q$update public.leads set status = 'contacted'
    where full_name = 'Via Edge Fn'$q$);
  if msg <> '' then raise exception 'CRITICAL: the service role cannot advance a lead (%)', msg; end if;

  -- ...but even it cannot rewrite history.
  msg := test_helpers.try($q$delete from public.lead_activities where id = '00000000-0000-0000-0000-0000000a8001'$q$);
  if msg not like '%append-only%' then
    raise exception 'CRITICAL: the service role deleted an audit trail entry (%)', msg;
  end if;

  msg := test_helpers.try($q$delete from public.event_dlq where attempts = 1$q$);
  if msg <> '' then raise exception 'CRITICAL: the retry worker cannot clear a dead letter (%)', msg; end if;
  select count(*) into n from public.event_dlq;
  if n <> 0 then raise exception 'CRITICAL: the dead letter was not cleared'; end if;

  raise notice 'PASS: the service role captures leads and drains dead letters — and still cannot rewrite history';
end $$;

rollback;
