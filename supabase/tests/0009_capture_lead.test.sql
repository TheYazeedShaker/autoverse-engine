-- 0009_capture_lead.test.sql
-- MANDATORY test for migration 20260922234823_capture_lead.sql (1·A Slice 8).
-- Proves: capture_lead writes the lead AND its first activity or neither — never half; consent is
-- refused rather than defaulted; the function is callable by the service role only, so a browser
-- cannot reach it even though it lives in the exposed schema.

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

insert into auth.users (id) values ('00000000-0000-0000-0000-0000000000a1');
insert into public.brands (id, slug, name) values
  ('00000000-0000-0000-0000-00000000000a', 'brand-a', 'Brand A');
insert into public.profiles (id, brand_id, brand_role) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', 'brand_admin');
insert into public.brand_markets (brand_id, market_code, currency, locale, live) values
  ('00000000-0000-0000-0000-00000000000a', 'EG', 'EGP', 'ar-EG', true);

-- ---- 1. a lead and its history arrive together ----
do $$
declare new_lead_id uuid; activities int; consent_in_trail text;
begin
  new_lead_id := public.capture_lead(jsonb_build_object(
    'brand_id', '00000000-0000-0000-0000-00000000000a',
    'market_code', 'EG',
    'full_name', 'Fatma Hassan',
    'phone', '+201000000001',
    'type', 'test_drive',
    'consent_text_version', 'eg-v1',
    'consent_at', now()::text,
    'submission_id', '00000000-0000-0000-0000-00000000c001'
  ));

  if new_lead_id is null then raise exception 'FAIL: capture_lead returned no id'; end if;

  select count(*) into activities from public.lead_activities where lead_id = new_lead_id;
  if activities <> 1 then
    raise exception 'CRITICAL: a lead was stored with % activities — a lead must always have a history', activities;
  end if;

  -- The consent that was given is in the trail, not just in the lead row.
  select payload ->> 'consent_text_version' into consent_in_trail
  from public.lead_activities where lead_id = new_lead_id;
  if consent_in_trail <> 'eg-v1' then
    raise exception 'FAIL: the first activity did not record the consent version (got %)', consent_in_trail;
  end if;

  raise notice 'PASS: a lead and its first activity are written together, with the consent recorded in both';
end $$;

-- ---- 2. no consent, no lead — and nothing half-written ----
do $$
declare msg text; leads_before int; leads_after int; activities_after int;
begin
  select count(*) into leads_before from public.leads;

  msg := test_helpers.try($q$select public.capture_lead(jsonb_build_object(
    'brand_id', '00000000-0000-0000-0000-00000000000a', 'market_code', 'EG',
    'full_name', 'No Consent', 'phone', '+201000000002'))$q$);
  if msg not like '%consent_text_version is required%' then
    raise exception 'CRITICAL: a lead was captured without consent (%)', msg;
  end if;

  msg := test_helpers.try($q$select public.capture_lead(jsonb_build_object(
    'brand_id', '00000000-0000-0000-0000-00000000000a', 'market_code', 'EG',
    'full_name', 'No Moment', 'phone', '+201000000003', 'consent_text_version', 'eg-v1'))$q$);
  if msg not like '%consent_at is required%' then
    raise exception 'CRITICAL: a lead was captured without the moment of consent (%)', msg;
  end if;

  select count(*) into leads_after from public.leads;
  if leads_after <> leads_before then
    raise exception 'CRITICAL: a refused capture still wrote % lead row(s)', leads_after - leads_before;
  end if;

  -- A failure inside the function rolls the whole thing back: no orphan activity either.
  msg := test_helpers.try($q$select public.capture_lead(jsonb_build_object(
    'brand_id', '00000000-0000-0000-0000-00000000000a', 'market_code', 'SA',
    'full_name', 'Wrong Market', 'phone', '+201000000004',
    'consent_text_version', 'eg-v1', 'consent_at', now()::text,
    'submission_id', '00000000-0000-0000-0000-00000000c004'))$q$);
  if msg = '' then raise exception 'FAIL: a lead was captured for a market the brand does not operate in'; end if;

  select count(*) into activities_after from public.lead_activities;
  if activities_after <> 1 then
    raise exception 'CRITICAL: a failed capture left % orphan activities behind', activities_after - 1;
  end if;

  raise notice 'PASS: a refused capture writes nothing at all — no lead, no orphan activity';
end $$;

-- ---- 3. a browser cannot call it, even though it lives in the exposed schema ----
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
do $$
declare msg text;
begin
  msg := test_helpers.try($q$select public.capture_lead(jsonb_build_object(
    'brand_id', '00000000-0000-0000-0000-00000000000a', 'market_code', 'EG',
    'full_name', 'Direct Call', 'phone', '+201000000005',
    'consent_text_version', 'eg-v1', 'consent_at', now()::text))$q$);
  if msg not like '%permission denied%' then
    raise exception 'CRITICAL: a signed-in user called capture_lead directly (%)', msg;
  end if;
  raise notice 'PASS: capture_lead is service-role only — a browser cannot reach it';
end $$;

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$
declare msg text;
begin
  msg := test_helpers.try($q$select public.capture_lead('{}'::jsonb)$q$);
  if msg not like '%permission denied%' then
    raise exception 'CRITICAL: anon called capture_lead (%)', msg;
  end if;
  raise notice 'PASS: anon cannot call capture_lead either';
end $$;

-- ---- 4. the service role can, which is the whole point ----
reset role;
set local role service_role;
select set_config('request.jwt.claims', '', true);
do $$
declare new_lead_id uuid;
begin
  new_lead_id := public.capture_lead(jsonb_build_object(
    'brand_id', '00000000-0000-0000-0000-00000000000a', 'market_code', 'EG',
    'full_name', 'Via Edge Fn', 'phone', '+201000000006',
    'consent_text_version', 'eg-v1', 'consent_at', now()::text,
    'submission_id', '00000000-0000-0000-0000-00000000c006'));
  if new_lead_id is null then raise exception 'CRITICAL: the service role could not capture a lead'; end if;
  raise notice 'PASS: the service role captures leads — the only path there is';
end $$;

rollback;
