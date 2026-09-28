-- 0026_consent_texts_and_capture_key.test.sql
-- MANDATORY isolation test for migration 20260928140000_consent_texts_and_capture_key.sql
-- (owner decisions, #build-decisions 2026-09-28: consent A, key A). Proves:
--   * consent_texts is append-only for everyone (update, delete and truncate refused, the
--     service role included), with its format, length and placeholder rules;
--   * a lead must cite an existing consent version of ITS OWN brand-market;
--   * showroom_catalog, as anon: brand A gets A's current consent text only (the latest already
--     published, never a scheduled one, never B's), and exactly {version, en, ar};
--   * capture_key is only the newest UNREVOKED key labelled 'web', a bare string: never a revoked
--     key, another label's key or another brand's key; null when there is none;
--   * RLS: anon reads no consent row directly; a brand reads its own only and writes none; staff
--     read all.
-- A violation RAISES EXCEPTION. Rolls back, so no fixture data persists.

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
grant execute on function test_helpers.try(text) to anon, authenticated, service_role;

-- ===== fixtures (database owner = trusted server context) =====
insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000026a1'),
  ('00000000-0000-0000-0000-0000000026c1');
insert into public.brands (id, slug, name, status) values
  ('00000000-0000-0000-0000-0000000026aa', 'brand-a', 'Brand A', 'live'),
  ('00000000-0000-0000-0000-0000000026bb', 'brand-b', 'Brand B', 'live');
insert into public.profiles (id, brand_id, brand_role, platform_role) values
  ('00000000-0000-0000-0000-0000000026a1', '00000000-0000-0000-0000-0000000026aa', 'brand_admin', null),
  ('00000000-0000-0000-0000-0000000026c1', null, null, 'ops');
insert into public.brand_markets (brand_id, market_code, currency, locale, live, subdomain) values
  ('00000000-0000-0000-0000-0000000026aa', 'EG', 'EGP', 'ar-EG', true, 'a-eg'),
  ('00000000-0000-0000-0000-0000000026aa', 'AE', 'AED', 'ar-AE', true, 'a-ae'),
  ('00000000-0000-0000-0000-0000000026bb', 'EG', 'EGP', 'ar-EG', true, 'b-eg');

-- A/EG: v1 (old), v2 (current), v3 (scheduled for tomorrow). A/AE: none. B/EG: its own v1.
insert into public.consent_texts (brand_id, market_code, version, text_en, text_ar, published_at) values
  ('00000000-0000-0000-0000-0000000026aa', 'EG', 'eg-v1', 'A old consent, {Brand}.',     'أ قديم {Brand}.',  now() - interval '30 days'),
  ('00000000-0000-0000-0000-0000000026aa', 'EG', 'eg-v2', 'A current consent, {Brand}.', 'أ حالي {Brand}.',  now() - interval '1 day'),
  ('00000000-0000-0000-0000-0000000026aa', 'EG', 'eg-v3', 'A scheduled consent.',        'أ مجدول.',         now() + interval '1 day'),
  ('00000000-0000-0000-0000-0000000026bb', 'EG', 'eg-v1', 'B consent SECRET-B.',         'ب SECRET-B.',      now() - interval '1 day');

-- A: an old web key, the newest web key, a NEWER key with another label, and a NEWER revoked web key.
-- B: a web key (must never appear under A).
insert into public.brand_publishable_keys (brand_id, key, label, created_at, revoked_at) values
  ('00000000-0000-0000-0000-0000000026aa', 'pk_A1old000000000000000000000000000', 'web', now() - interval '20 days', null),
  ('00000000-0000-0000-0000-0000000026aa', 'pk_A2web000000000000000000000000000', 'web', now() - interval '10 days', null),
  ('00000000-0000-0000-0000-0000000026aa', 'pk_A3app000000000000000000000000000', 'app', now() - interval '5 days',  null),
  ('00000000-0000-0000-0000-0000000026aa', 'pk_A4rev000000000000000000000000000', 'web', now() - interval '1 day',   now()),
  ('00000000-0000-0000-0000-0000000026bb', 'pk_B1web000000000000000000000000000', 'web', now() - interval '10 days', null);

-- ---- 0. format, length and placeholder rules ----
do $$
declare msg text;
begin
  msg := test_helpers.try($q$insert into public.consent_texts (brand_id, market_code, version, text_en, text_ar)
    values ('00000000-0000-0000-0000-0000000026aa', 'EG', 'EG V4', 'x', 'x')$q$);
  if msg not like '%consent_texts_version_format%' then raise exception 'FAIL: a malformed version was stored (%)', msg; end if;

  msg := test_helpers.try($q$insert into public.consent_texts (brand_id, market_code, version, text_en, text_ar)
    values ('00000000-0000-0000-0000-0000000026aa', 'EG', 'eg-v4', '   ', 'x')$q$);
  if msg not like '%consent_texts_text_length%' then raise exception 'FAIL: a blank consent text was stored (%)', msg; end if;

  msg := test_helpers.try($q$insert into public.consent_texts (brand_id, market_code, version, text_en, text_ar)
    values ('00000000-0000-0000-0000-0000000026aa', 'EG', 'eg-v4', 'I agree that {brand} may call.', 'x')$q$);
  if msg not like '%consent_texts_placeholders%' then raise exception 'FAIL: an unknown placeholder was stored (%)', msg; end if;

  msg := test_helpers.try($q$insert into public.consent_texts (brand_id, market_code, version, text_en, text_ar)
    values ('00000000-0000-0000-0000-0000000026aa', 'EG', 'eg-v4', 'x', 'يوافق {Brand')$q$);
  if msg not like '%consent_texts_placeholders%' then raise exception 'FAIL: a stray brace was stored (%)', msg; end if;

  msg := test_helpers.try($q$insert into public.consent_texts (brand_id, market_code, version, text_en, text_ar)
    values ('00000000-0000-0000-0000-0000000026aa', 'SA', 'sa-v1', 'x', 'x')$q$);
  if msg not like '%violates foreign key constraint%' then raise exception 'FAIL: consent for a market the brand lacks was stored (%)', msg; end if;

  msg := test_helpers.try($q$insert into public.consent_texts (brand_id, market_code, version, text_en, text_ar)
    values ('00000000-0000-0000-0000-0000000026aa', 'EG', 'eg-v2', 'dup', 'dup')$q$);
  if msg not like '%consent_texts_version_unique%' then raise exception 'FAIL: a version was reused (%)', msg; end if;
  -- Whitespace of any kind is still blank (the consumer's Zod applies the same rule).
  msg := test_helpers.try(format($q$insert into public.consent_texts (brand_id, market_code, version, text_en, text_ar)
    values ('00000000-0000-0000-0000-0000000026aa', 'EG', 'eg-v4', 'x', %L)$q$, E'\n\t '));
  if msg not like '%consent_texts_text_length%' then raise exception 'FAIL: a whitespace-only consent text was stored (%)', msg; end if;

  msg := test_helpers.try(format($q$insert into public.consent_texts (brand_id, market_code, version, text_en, text_ar)
    values ('00000000-0000-0000-0000-0000000026aa', 'EG', 'eg-v4', %L, 'x')$q$, repeat('a', 2001)));
  if msg not like '%consent_texts_text_length%' then raise exception 'FAIL: a consent text over 2000 characters was stored (%)', msg; end if;
  raise notice 'PASS: consent text format, length, placeholder and uniqueness rules hold';
end $$;

-- created_at is the database's clock, whatever the insert says; published_at may be chosen.
do $$
declare c timestamptz;
begin
  insert into public.consent_texts (brand_id, market_code, version, text_en, text_ar, published_at, created_at)
  values ('00000000-0000-0000-0000-0000000026bb', 'EG', 'eg-v0', 'B older.', 'ب أقدم.', now() - interval '90 days', '2001-01-01')
  returning created_at into c;
  if c is distinct from now() then raise exception 'FAIL: created_at was taken from the insert (%)', c; end if;
  raise notice 'PASS: created_at is stamped by the database';
end $$;

-- ---- 1. append-only, even for the database owner and the service role ----
do $$
declare msg text;
begin
  msg := test_helpers.try($q$update public.consent_texts set text_en = 'rewritten' where version = 'eg-v1'$q$);
  if msg not like '%append-only%' then raise exception 'CRITICAL: the owner rewrote a consent text (%)', msg; end if;
  msg := test_helpers.try($q$delete from public.consent_texts where version = 'eg-v1'$q$);
  if msg not like '%append-only%' then raise exception 'CRITICAL: the owner deleted a consent text (%)', msg; end if;
  msg := test_helpers.try($q$truncate public.consent_texts cascade$q$);
  if msg not like '%append-only%' then raise exception 'CRITICAL: the owner truncated consent texts (%)', msg; end if;
  raise notice 'PASS: consent texts are append-only for the owner';
end $$;

set local role service_role;
do $$
declare msg text;
begin
  msg := test_helpers.try($q$update public.consent_texts set text_en = 'rewritten' where version = 'eg-v1'$q$);
  if msg not like '%append-only%' and msg not like '%permission denied%' then
    raise exception 'CRITICAL: the service role rewrote a consent text (%)', msg;
  end if;
  msg := test_helpers.try($q$delete from public.consent_texts where version = 'eg-v1'$q$);
  if msg not like '%append-only%' and msg not like '%permission denied%' then
    raise exception 'CRITICAL: the service role deleted a consent text (%)', msg;
  end if;
  raise notice 'PASS: consent texts are append-only for the service role';
end $$;
reset role;

-- ---- 2. a lead cites an existing consent version of its own brand-market ----
do $$
declare msg text;
begin
  msg := test_helpers.try($q$insert into public.leads (brand_id, market_code, full_name, phone, consent_text_version, consent_at, submission_id)
    values ('00000000-0000-0000-0000-0000000026aa', 'EG', 'Unknown Version', '+201000002601', 'eg-v9', now(), gen_random_uuid())$q$);
  if msg not like '%leads_consent_text_fkey%' then raise exception 'CRITICAL: a lead cited a consent version that does not exist (%)', msg; end if;

  -- A/AE has no consent text: A/EG's version is not valid there.
  msg := test_helpers.try($q$insert into public.leads (brand_id, market_code, full_name, phone, consent_text_version, consent_at, submission_id)
    values ('00000000-0000-0000-0000-0000000026aa', 'AE', 'Other Market', '+971500002602', 'eg-v2', now(), gen_random_uuid())$q$);
  if msg not like '%leads_consent_text_fkey%' then raise exception 'CRITICAL: a lead cited another market''s consent version (%)', msg; end if;

  msg := test_helpers.try($q$insert into public.leads (brand_id, market_code, full_name, phone, consent_text_version, consent_at, submission_id)
    values ('00000000-0000-0000-0000-0000000026aa', 'EG', 'Current Version', '+201000002603', 'eg-v2', now(), gen_random_uuid())$q$);
  if msg <> '' then raise exception 'FAIL: a lead citing the current version was refused (%)', msg; end if;
  raise notice 'PASS: leads must cite an existing consent version of their own brand-market';
end $$;

-- ---- 3. showroom_catalog as anon: A's current consent and A's newest unrevoked web key ----
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

do $$
declare
  a jsonb := public.showroom_catalog('a-eg');
  txt text := a::text;
  keys text[];
begin
  if a -> 'lead_consent' ->> 'version' is distinct from 'eg-v2' then
    raise exception 'FAIL: expected the current version eg-v2, got %', a -> 'lead_consent';
  end if;
  if a -> 'lead_consent' ->> 'en' is distinct from 'A current consent, {Brand}.' or a -> 'lead_consent' ->> 'ar' is distinct from 'أ حالي {Brand}.' then
    raise exception 'FAIL: wrong consent wording %', a -> 'lead_consent';
  end if;
  select array_agg(k order by k) into keys from jsonb_object_keys(a -> 'lead_consent') k;
  if keys is distinct from array['ar','en','version'] then raise exception 'FAIL: lead_consent exposes %', keys; end if;
  if txt like '%eg-v3%' or txt like '%scheduled%' then
    raise exception 'CRITICAL: a consent text scheduled for later is already served';
  end if;

  if jsonb_typeof(a -> 'capture_key') is distinct from 'string' or a ->> 'capture_key' is distinct from 'pk_A2web000000000000000000000000000' then
    raise exception 'FAIL: expected A''s newest unrevoked web key, got %', a -> 'capture_key';
  end if;
  if txt like '%pk_A4rev%' then raise exception 'CRITICAL: a revoked key is served'; end if;
  if txt like '%pk_A3app%' then raise exception 'CRITICAL: a non-web key is served'; end if;
  if txt like '%pk_A1old%' then raise exception 'FAIL: an older web key is served alongside the newest'; end if;

  if txt like '%SECRET-B%' or txt like '%pk_B1%' or txt like '%26bb%' then
    raise exception 'CRITICAL: brand A''s showroom contains brand B''s consent text or key: %', txt;
  end if;
  raise notice 'PASS: A gets its own current consent text and newest unrevoked web key, nothing else';
end $$;

do $$
declare b jsonb := public.showroom_catalog('b-eg'); ae jsonb := public.showroom_catalog('a-ae');
begin
  if b ->> 'capture_key' is distinct from 'pk_B1web000000000000000000000000000' or b -> 'lead_consent' ->> 'en' is distinct from 'B consent SECRET-B.' then
    raise exception 'FAIL: brand B should get its own consent and key, got % %', b -> 'lead_consent', b -> 'capture_key';
  end if;
  -- A/AE has no consent text: null, so the page shows no lead CTAs there.
  if ae -> 'lead_consent' is distinct from 'null'::jsonb then
    raise exception 'FAIL: a market with no consent text returned one: %', ae -> 'lead_consent';
  end if;
  raise notice 'PASS: each brand-market gets its own; no consent text is null';
end $$;

-- ---- 4. revocation: revoking the newest web key falls back; revoking all gives null ----
reset role;
update public.brand_publishable_keys set revoked_at = now() where key = 'pk_A2web000000000000000000000000000';
set local role anon;
do $$
declare a jsonb := public.showroom_catalog('a-eg');
begin
  if a ->> 'capture_key' is distinct from 'pk_A1old000000000000000000000000000' then
    raise exception 'CRITICAL: after revoking the newest web key, expected the older unrevoked one, got %', a -> 'capture_key';
  end if;
end $$;
reset role;
update public.brand_publishable_keys set revoked_at = now() where key = 'pk_A1old000000000000000000000000000';
set local role anon;
do $$
declare a jsonb := public.showroom_catalog('a-eg');
begin
  if a -> 'capture_key' is distinct from 'null'::jsonb then
    raise exception 'CRITICAL: with every web key revoked, a key is still served: %', a -> 'capture_key';
  end if;
  raise notice 'PASS: a revoked key is never served';
end $$;

-- ---- 5. RLS on consent_texts ----
do $$
declare n int; msg text;
begin
  msg := test_helpers.try($q$select count(*) from public.consent_texts$q$);
  if msg not like '%permission denied%' then raise exception 'CRITICAL: anon reads consent_texts directly (%)', msg; end if;
  msg := test_helpers.try($q$insert into public.consent_texts (brand_id, market_code, version, text_en, text_ar)
    values ('00000000-0000-0000-0000-0000000026aa', 'EG', 'eg-v5', 'x', 'x')$q$);
  if msg not like '%permission denied%' then raise exception 'CRITICAL: anon wrote a consent text (%)', msg; end if;
end $$;

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000026a1","role":"authenticated"}', true);
do $$
declare n int; msg text;
begin
  select count(*) into n from public.consent_texts where brand_id = '00000000-0000-0000-0000-0000000026bb';
  if n <> 0 then raise exception 'CRITICAL: brand A reads brand B''s consent texts (got %)', n; end if;
  select count(*) into n from public.consent_texts where brand_id = '00000000-0000-0000-0000-0000000026aa';
  if n <> 3 then raise exception 'FAIL: brand A should read its own 3 consent texts (got %)', n; end if;
  msg := test_helpers.try($q$insert into public.consent_texts (brand_id, market_code, version, text_en, text_ar)
    values ('00000000-0000-0000-0000-0000000026aa', 'EG', 'eg-v5', 'x', 'x')$q$);
  if msg not like '%permission denied%' then raise exception 'CRITICAL: a brand user wrote a consent text (%)', msg; end if;
  raise notice 'PASS: a brand reads only its own consent texts and writes none';
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000026c1","role":"authenticated"}', true);
do $$
declare n int;
begin
  select count(*) into n from public.consent_texts
   where brand_id in ('00000000-0000-0000-0000-0000000026aa', '00000000-0000-0000-0000-0000000026bb');
  if n <> 5 then raise exception 'FAIL: staff should read all 5 consent texts (got %)', n; end if;
  raise notice 'PASS: staff read every brand''s consent texts';
end $$;
reset role;

rollback;
