-- 0017_lead_activity_brand_fk.test.sql
-- MANDATORY test for migration 20260925120000_lead_activity_brand_fk.sql (BLOCK finding #7).
-- Proves: an audit entry cannot be filed under a brand that does not own its lead. The database
-- refuses the row, so brand B can never be shown an activity belonging to brand A's lead — the
-- read policies are not asked to make that judgement. Also proves the old guarantees survive the
-- swap (a dangling lead_id is still refused, a correct entry is still accepted) and that
-- capture_lead's first activity still carries the lead's own brand.

begin;

create schema test_helpers;
create function test_helpers.try(stmt text) returns text language plpgsql as $$
begin
  execute stmt;
  return '';
exception when others then
  return sqlerrm;
end $$;

insert into public.brands (id, slug, name) values
  ('00000000-0000-0000-0000-00000000000a', 'brand-a', 'Brand A'),
  ('00000000-0000-0000-0000-00000000000b', 'brand-b', 'Brand B');
insert into public.brand_markets (brand_id, market_code, currency, locale, live) values
  ('00000000-0000-0000-0000-00000000000a', 'EG', 'EGP', 'ar-EG', true),
  ('00000000-0000-0000-0000-00000000000b', 'EG', 'EGP', 'ar-EG', true);

insert into public.leads (id, brand_id, market_code, full_name, phone, consent_text_version, consent_at, submission_id) values
  ('00000000-0000-0000-0000-0000000a7001', '00000000-0000-0000-0000-00000000000a', 'EG',
   'Fatma Hassan', '+201000000001', 'eg-v1', now(), '00000000-0000-0000-0000-00000000d001'),
  ('00000000-0000-0000-0000-0000000b7001', '00000000-0000-0000-0000-00000000000b', 'EG',
   'Omar Adel', '+201000000002', 'eg-v1', now(), '00000000-0000-0000-0000-00000000d002');

-- ---- 1. an activity whose brand is not its lead's brand is refused ----
-- This is the finding. Written as the service role, which is what the pipelines run as: it is
-- inside RLS's blind spot, so only the constraint can stop it.
do $$
declare msg text;
begin
  msg := test_helpers.try($q$insert into public.lead_activities (brand_id, lead_id, kind, payload)
    values ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000a7001',
            'note', '{"event": "misfiled"}'::jsonb)$q$);
  if msg = '' then
    raise exception 'CRITICAL: brand B filed an audit entry against brand A''s lead — the composite foreign key is not enforcing tenancy';
  end if;
  if msg not like '%lead_activities_lead_brand_fkey%' then
    raise exception 'CRITICAL: the cross-brand activity was refused, but not by the tenancy constraint (%)', msg;
  end if;
  raise notice 'PASS: an activity cannot be filed under a brand that does not own the lead';
end $$;

-- ---- 2. the same row, seen from the reader's side ----
-- Nothing of brand A's lead reached brand B's slice of lead_activities, because nothing was
-- written. The isolation holds at the row, not at the policy.
do $$
declare n int;
begin
  select count(*) into n from public.lead_activities
   where brand_id = '00000000-0000-0000-0000-00000000000b';
  if n <> 0 then
    raise exception 'CRITICAL: brand B has % activity row(s) it should not have', n;
  end if;
  raise notice 'PASS: no misfiled row exists for the other brand to read';
end $$;

-- ---- 3. a correct activity is still accepted, and a dangling lead is still refused ----
do $$
declare msg text;
begin
  msg := test_helpers.try($q$insert into public.lead_activities (brand_id, lead_id, kind, payload)
    values ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000a7001',
            'status_change', '{"from": "new", "to": "contacted"}'::jsonb)$q$);
  if msg <> '' then
    raise exception 'CRITICAL: a brand can no longer record activity against its own lead (%)', msg;
  end if;

  msg := test_helpers.try($q$insert into public.lead_activities (brand_id, lead_id, kind, payload)
    values ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000a7999',
            'note', '{}'::jsonb)$q$);
  if msg = '' then
    raise exception 'CRITICAL: an activity was recorded against a lead that does not exist';
  end if;
  raise notice 'PASS: a matching activity is accepted; a dangling lead_id is still refused';
end $$;

-- ---- 4. the brand cannot be edited away from the lead afterwards ----
-- The append-only guard already refuses every update; this records that the constraint would
-- refuse this one too, so the two protections are not relying on each other.
do $$
declare msg text;
begin
  msg := test_helpers.try($q$update public.lead_activities
    set brand_id = '00000000-0000-0000-0000-00000000000b'
    where lead_id = '00000000-0000-0000-0000-0000000a7001'$q$);
  if msg = '' then
    raise exception 'CRITICAL: an existing activity was moved to another brand';
  end if;
  raise notice 'PASS: an activity cannot be moved to another brand after the fact';
end $$;

-- ---- 5. the writers still agree with the constraint ----
-- capture_lead writes the first activity in the same transaction as the lead. If it ever passed a
-- brand of its own choosing rather than the lead's, this capture would fail outright.
do $$
declare new_lead_id uuid; n int;
begin
  new_lead_id := public.capture_lead(jsonb_build_object(
    'brand_id', '00000000-0000-0000-0000-00000000000b',
    'market_code', 'EG',
    'full_name', 'Nour Ibrahim',
    'phone', '+201000000003',
    'consent_text_version', 'eg-v1',
    'consent_at', now()::text,
    'submission_id', '00000000-0000-0000-0000-00000000d003'));

  select count(*) into n from public.lead_activities a
    join public.leads l on l.id = a.lead_id
   where a.lead_id = new_lead_id and a.brand_id = l.brand_id;
  if n <> 1 then
    raise exception 'CRITICAL: capture_lead wrote % first activities carrying the lead''s brand, expected 1', n;
  end if;
  raise notice 'PASS: capture_lead still writes exactly one first activity, under the lead''s own brand';
end $$;

-- ---- 6. the invariant, swept over every row this test produced ----
do $$
declare n int;
begin
  select count(*) into n from public.lead_activities a
    join public.leads l on l.id = a.lead_id
   where a.brand_id <> l.brand_id;
  if n <> 0 then
    raise exception 'CRITICAL: % activity row(s) are filed under a brand that does not own the lead', n;
  end if;
  raise notice 'PASS: every activity row belongs to the brand that owns its lead';
end $$;

rollback;
