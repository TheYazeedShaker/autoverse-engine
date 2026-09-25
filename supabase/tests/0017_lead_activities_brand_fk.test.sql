-- 0017_lead_activities_brand_fk.test.sql
-- MANDATORY test for migration 20260925120000_lead_activities_brand_fk.sql (BLOCK finding #7).
-- Proves: an activity cannot name a brand other than its lead's, even when written with the
-- privileges that bypass RLS (RLS files a row by its brand_id, so a mismatch is a cross-tenant
-- leak); an activity under the right brand is still accepted; and the activity capture_lead
-- writes still lands.

begin;

create schema test_helpers;
create function test_helpers.try(stmt text) returns text language plpgsql as $$
begin
  execute stmt;
  return '';
exception when others then
  return sqlstate || ': ' || sqlerrm;
end $$;

insert into public.brands (id, slug, name) values
  ('00000000-0000-0000-0000-00000000000a', 'brand-a', 'Brand A'),
  ('00000000-0000-0000-0000-00000000000b', 'brand-b', 'Brand B');
insert into public.brand_markets (brand_id, market_code, currency, locale, live) values
  ('00000000-0000-0000-0000-00000000000a', 'EG', 'EGP', 'ar-EG', true),
  ('00000000-0000-0000-0000-00000000000b', 'EG', 'EGP', 'ar-EG', true);

-- Brand A's lead, through the real capture path.
select public.capture_lead(jsonb_build_object(
  'brand_id', '00000000-0000-0000-0000-00000000000a', 'market_code', 'EG',
  'full_name', 'Fatma Hassan', 'phone', '+201000000001',
  'consent_text_version', 'eg-v1', 'consent_at', now()::text,
  'submission_id', '00000000-0000-0000-0000-00000000d017'));

-- ---- 1. an activity under another brand than its lead is refused ----
do $$
declare lead uuid; err text;
begin
  select id into lead from public.leads where brand_id = '00000000-0000-0000-0000-00000000000a';
  err := test_helpers.try(format(
    $q$insert into public.lead_activities (brand_id, lead_id, kind, payload)
       values ('00000000-0000-0000-0000-00000000000b', %L, 'note', '{}')$q$, lead));
  if err = '' then
    raise exception 'CRITICAL: an activity under brand B was attached to brand A''s lead';
  end if;
  -- The constraint's name too, so a fixture change that trips some other foreign key can't pass.
  if err not like '23503:%lead_activities_lead_brand_fkey%' then
    raise exception 'expected lead_activities_lead_brand_fkey to refuse it, got: %', err;
  end if;
  raise notice 'PASS: an activity cannot name a brand other than its lead''s';
end $$;

-- ---- 2. the legitimate paths still work ----
do $$
declare lead uuid; err text; n int;
begin
  select id into lead from public.leads where brand_id = '00000000-0000-0000-0000-00000000000a';

  select count(*) into n from public.lead_activities where lead_id = lead;
  if n <> 1 then raise exception 'capture_lead''s first activity is missing (% rows)', n; end if;

  err := test_helpers.try(format(
    $q$insert into public.lead_activities (brand_id, lead_id, kind, payload)
       values ('00000000-0000-0000-0000-00000000000a', %L, 'note', '{}')$q$, lead));
  if err <> '' then raise exception 'an activity under the lead''s own brand was refused: %', err; end if;

  raise notice 'PASS: activities under the lead''s own brand are accepted';
end $$;

rollback;
