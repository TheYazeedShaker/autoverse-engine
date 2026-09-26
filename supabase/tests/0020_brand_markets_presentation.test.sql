-- 0020_brand_markets_presentation.test.sql
-- Migration 20260926151000_brand_markets_presentation.sql: new public presentation columns on
-- brand_markets (footer tagline, hotline, contact email, cities line, lead city list).
-- Proves: good values are accepted; half-bilingual pairs, a malformed hotline or email, and a
-- malformed, oversized or duplicated city list are refused; anon and brand users still cannot
-- write the table (the new columns add no write path). Read isolation for brand_markets is
-- unchanged and stays covered by 0003.
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

insert into auth.users (id) values ('00000000-0000-0000-0000-0000000020a1');
insert into public.brands (id, slug, name) values
  ('00000000-0000-0000-0000-00000000020a', 'brand-20', 'Brand 20');
insert into public.profiles (id, brand_id, brand_role, platform_role) values
  ('00000000-0000-0000-0000-0000000020a1', '00000000-0000-0000-0000-00000000020a', 'brand_admin', null);
insert into public.brand_markets (id, brand_id, market_code, currency, locale) values
  ('00000000-0000-0000-0000-0000000200e1', '00000000-0000-0000-0000-00000000020a', 'EG', 'EGP', 'ar-EG');

-- ---- 1. valid values are accepted ----
update public.brand_markets set
  footer_tagline_en = 'Drive what moves you',
  footer_tagline_ar = 'قد ما يحركك',
  hotline = '16000',
  contact_email = 'hello@example.test',
  cities_en = 'Cairo · Alexandria',
  cities_ar = 'القاهرة · الإسكندرية',
  lead_cities = '[{"id":"cairo","en":"Cairo","ar":"القاهرة"},{"id":"alexandria","en":"Alexandria","ar":"الإسكندرية"}]'
where id = '00000000-0000-0000-0000-0000000200e1';

update public.brand_markets set hotline = '+20 2 1234-5678'
where id = '00000000-0000-0000-0000-0000000200e1';

-- ---- 2. bad values are refused, each by its own constraint ----
do $$
declare
  msg text;
  target constant text := $t$ where id = '00000000-0000-0000-0000-0000000200e1'$t$;
  cases constant text[][] := array[
    array['footer_tagline_ar = null',                       'brand_markets_footer_tagline_bilingual'],
    array['cities_en = null',                               'brand_markets_cities_bilingual'],
    array['footer_tagline_en = repeat(''x'', 161)',         'brand_markets_presentation_lengths'],
    array['hotline = ''call us''',                          'brand_markets_hotline_format'],
    array['hotline = ''12''',                               'brand_markets_hotline_format'],
    array['contact_email = ''not-an-email''',               'brand_markets_contact_email_format'],
    array['lead_cities = ''{"id":"cairo"}''',               'brand_markets_lead_cities_valid'],
    array['lead_cities = ''[{"id":"Cairo","en":"C","ar":"ق"}]''',            'brand_markets_lead_cities_valid'],
    array['lead_cities = ''[{"id":"cairo","en":"","ar":"ق"}]''',             'brand_markets_lead_cities_valid'],
    array['lead_cities = ''[{"id":"cairo","en":"Cairo"}]''',                 'brand_markets_lead_cities_valid'],
    array['lead_cities = ''[{"id":"cairo","en":"C","ar":"ق"},{"id":"cairo","en":"C2","ar":"ق2"}]''', 'brand_markets_lead_cities_valid'],
    array['lead_cities = (select jsonb_agg(jsonb_build_object(''id'', ''c'' || g, ''en'', ''C'', ''ar'', ''ق'')) from generate_series(1, 101) g)', 'brand_markets_lead_cities_valid']
  ];
  i int;
begin
  for i in 1 .. array_length(cases, 1) loop
    msg := test_helpers.try('update public.brand_markets set ' || cases[i][1] || target);
    if msg not like '%' || cases[i][2] || '%' then
      raise exception 'FAIL: "%" was not refused by % (%)', cases[i][1], cases[i][2], msg;
    end if;
  end loop;
  raise notice 'PASS: malformed presentation values are refused';
end $$;

-- ---- 3. no new write path: anon and a brand admin still cannot write brand_markets ----
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$
declare msg text;
begin
  msg := test_helpers.try($q$update public.brand_markets set hotline = '19999'
    where id = '00000000-0000-0000-0000-0000000200e1'$q$);
  if msg not like '%permission denied%' then
    raise exception 'CRITICAL: anon could write brand_markets (%)', coalesce(nullif(msg, ''), 'no error');
  end if;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000020a1","role":"authenticated"}', true);
do $$
declare msg text;
begin
  msg := test_helpers.try($q$update public.brand_markets set hotline = '19999'
    where id = '00000000-0000-0000-0000-0000000200e1'$q$);
  if msg not like '%permission denied%' then
    raise exception 'CRITICAL: a brand admin could write brand_markets directly (%)', coalesce(nullif(msg, ''), 'no error');
  end if;
  raise notice 'PASS: the new columns add no write path';
end $$;
reset role;

rollback;
