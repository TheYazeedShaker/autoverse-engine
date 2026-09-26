-- 0022_showroom_catalog_read.test.sql
-- MANDATORY isolation test for migration 20260926170000_showroom_catalog_read.sql (ADR 0018).
-- Proves, calling public.showroom_catalog as anon (exactly as the consumer page does):
--   * brand A's subdomain never returns brand B's rows, not even B's ids;
--   * a non-live market, a non-live brand and an unknown subdomain all return NULL;
--   * only published models and trims, only this market's prices;
--   * assets only as public published copies (public_path), never storage_path or a draft's render;
--   * only the columns the page renders: exact key sets, and nothing from brand_market_private;
--   * anon still can't read the tables directly, and only anon may execute the function;
--   * subdomains are one canonical lower-case spelling; public_path is a safe relative key.
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

-- ===== fixtures (database owner = trusted server context) =====
-- A: live, market EG live (a-eg), market AE dormant (a-ae).
-- B: live, market EG live (b-eg).
-- C: brand in draft, its market marked live (c-eg).
insert into public.brands (id, slug, name, status) values
  ('00000000-0000-0000-0000-0000000022aa', 'brand-a', 'Brand A', 'live'),
  ('00000000-0000-0000-0000-0000000022bb', 'brand-b', 'Brand B', 'live'),
  ('00000000-0000-0000-0000-0000000022cc', 'brand-c', 'Brand C', 'draft');

insert into public.brand_markets (brand_id, market_code, currency, locale, live, subdomain, hotline) values
  ('00000000-0000-0000-0000-0000000022aa', 'EG', 'EGP', 'ar-EG', true,  'a-eg', '16000'),
  ('00000000-0000-0000-0000-0000000022aa', 'AE', 'AED', 'ar-AE', false, 'a-ae', null),
  ('00000000-0000-0000-0000-0000000022bb', 'EG', 'EGP', 'ar-EG', true,  'b-eg', '17000'),
  ('00000000-0000-0000-0000-0000000022cc', 'EG', 'EGP', 'ar-EG', true,  'c-eg', null);

-- Private routing config that must never appear in a showroom read.
insert into public.brand_market_private (brand_id, market_code, lead_routing_emails, lead_routing_webhook_url)
values ('00000000-0000-0000-0000-0000000022aa', 'EG', array['private-routing@a.example.test'], 'https://hooks.a.example.test/private-routing');

insert into public.brand_themes (brand_id, market_code, accent_hex, on_accent, hover_hex, muted_hex, focus_hex) values
  ('00000000-0000-0000-0000-0000000022aa', 'EG', '#1F4E8C', 'white', '#173B69', '#DCE4EE', '#1F4E8C'),
  ('00000000-0000-0000-0000-0000000022bb', 'EG', '#7A1F2B', 'white', '#5E1721', '#EEDCDF', '#7A1F2B');

insert into public.models (id, brand_id, slug, name_en, name_ar, publish_state, order_index, body_type, fuel, drive) values
  ('00000000-0000-0000-0000-00000022a001', '00000000-0000-0000-0000-0000000022aa', 'a-pub',   'A Pub',   'أ', 'published', 1, 'suv', 'ev', 'awd'),
  ('00000000-0000-0000-0000-00000022a002', '00000000-0000-0000-0000-0000000022aa', 'a-draft', 'A Draft', 'أ', 'draft',     2, null, null, null),
  ('00000000-0000-0000-0000-00000022b001', '00000000-0000-0000-0000-0000000022bb', 'b-pub',   'B Pub',   'ب', 'published', 1, 'sedan', 'petrol', 'fwd'),
  ('00000000-0000-0000-0000-00000022c001', '00000000-0000-0000-0000-0000000022cc', 'c-pub',   'C Pub',   'ج', 'published', 1, null, null, null);

insert into public.trims (id, brand_id, model_id, slug, name_en, name_ar, publish_state, drive) values
  ('00000000-0000-0000-0000-00000022a101', '00000000-0000-0000-0000-0000000022aa', '00000000-0000-0000-0000-00000022a001', 'base',   'Base',   'أ', 'published', 'rwd'),
  ('00000000-0000-0000-0000-00000022a102', '00000000-0000-0000-0000-0000000022aa', '00000000-0000-0000-0000-00000022a001', 'secret', 'Secret', 'أ', 'draft',     null),
  -- published trim under a DRAFT model: must never surface
  ('00000000-0000-0000-0000-00000022a201', '00000000-0000-0000-0000-0000000022aa', '00000000-0000-0000-0000-00000022a002', 'teaser', 'Teaser', 'أ', 'published', null),
  ('00000000-0000-0000-0000-00000022b101', '00000000-0000-0000-0000-0000000022bb', '00000000-0000-0000-0000-00000022b001', 'base',   'Base',   'ب', 'published', null);

insert into public.trim_prices (brand_id, trim_id, market_code, price_amount, on_request) values
  ('00000000-0000-0000-0000-0000000022aa', '00000000-0000-0000-0000-00000022a101', 'EG', 1500000, false),
  ('00000000-0000-0000-0000-0000000022aa', '00000000-0000-0000-0000-00000022a101', 'AE', 90000,   false),
  ('00000000-0000-0000-0000-0000000022bb', '00000000-0000-0000-0000-00000022b101', 'EG', 1600000, false);

insert into public.assets (brand_id, kind, storage_path, public_path, model_id, trim_id, view_key) values
  -- A: public side view of the published trim (returned)
  ('00000000-0000-0000-0000-0000000022aa', 'render', 'private/a/pub/base-side.png', 'pub/a/base-side.png',
   '00000000-0000-0000-0000-00000022a001', '00000000-0000-0000-0000-00000022a101', 'side'),
  -- A: a render not yet published (no public copy) -> never returned
  ('00000000-0000-0000-0000-0000000022aa', 'render', 'private/a/pub/base-front.png', null,
   '00000000-0000-0000-0000-00000022a001', '00000000-0000-0000-0000-00000022a101', 'front-34'),
  -- A: a public copy that (wrongly) exists for a draft model -> still never returned
  ('00000000-0000-0000-0000-0000000022aa', 'render', 'private/a/draft/side.png', 'pub/a/draft-side.png',
   '00000000-0000-0000-0000-00000022a002', null, 'side'),
  -- A: the draft trim's render -> never returned
  ('00000000-0000-0000-0000-0000000022aa', 'render', 'private/a/pub/secret-side.png', 'pub/a/secret-side.png',
   '00000000-0000-0000-0000-00000022a001', '00000000-0000-0000-0000-00000022a102', 'side'),
  -- A: a video on the right view -> never returned (not an image kind)
  ('00000000-0000-0000-0000-0000000022aa', 'banner_video', 'private/a/pub/banner.mp4', 'pub/a/banner.mp4',
   '00000000-0000-0000-0000-00000022a001', null, 'side'),
  -- B: public side view (must never appear under A)
  ('00000000-0000-0000-0000-0000000022bb', 'render', 'private/b/pub/side.png', 'pub/b/side.png',
   '00000000-0000-0000-0000-00000022b001', '00000000-0000-0000-0000-00000022b101', 'side');

-- ---- 1. anon calls the function: brand A's showroom contains A only ----
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

do $$
declare
  a jsonb := public.showroom_catalog('a-eg');
  txt text := a::text;
begin
  if a is null then raise exception 'FAIL: a live brand-market returned nothing'; end if;

  -- Cross-tenant: nothing of B, anywhere in the document.
  if txt like '%22bb%' or txt like '%22b001%' or txt like '%22b101%' or txt like '%b-pub%'
     or txt like '%pub/b/%' or txt like '%7A1F2B%' or txt like '%17000%' or txt like '%1600000%' then
    raise exception 'CRITICAL: brand A''s showroom contains brand B''s rows: %', txt;
  end if;
  if a -> 'brand' ->> 'slug' <> 'brand-a' or a -> 'market' ->> 'market_code' <> 'EG' then
    raise exception 'CRITICAL: wrong brand-market returned: % %', a -> 'brand', a -> 'market';
  end if;

  -- Published only.
  if jsonb_array_length(a -> 'models') <> 1 or a -> 'models' -> 0 ->> 'slug' <> 'a-pub' then
    raise exception 'CRITICAL: unpublished models leaked: %', a -> 'models';
  end if;
  if jsonb_array_length(a -> 'trims') <> 1 or a -> 'trims' -> 0 ->> 'slug' <> 'base' then
    raise exception 'CRITICAL: unpublished trims leaked (draft trim or trim of a draft model): %', a -> 'trims';
  end if;

  -- This market's prices only (not A's dormant AE price).
  if jsonb_array_length(a -> 'prices') <> 1 or (a -> 'prices' -> 0 ->> 'price_amount')::numeric <> 1500000 then
    raise exception 'CRITICAL: prices from another market leaked: %', a -> 'prices';
  end if;

  -- Public published copies only.
  if jsonb_array_length(a -> 'assets') <> 1 or a -> 'assets' -> 0 ->> 'public_path' <> 'pub/a/base-side.png' then
    raise exception 'CRITICAL: a non-public, draft or non-image asset was returned: %', a -> 'assets';
  end if;
  if txt like '%private/%' or txt like '%storage_path%' then
    raise exception 'CRITICAL: a private storage path was returned: %', txt;
  end if;

  -- Nothing from brand_market_private.
  if txt like '%private-routing%' or txt like '%lead_routing%' or txt like '%hooks.a.example%' then
    raise exception 'CRITICAL: private routing config leaked into the showroom read';
  end if;

  -- The vocabulary it needs, and only that.
  if (select array_agg(e ->> 'id' order by e ->> 'id') from jsonb_array_elements(a -> 'vocabulary') e)
     <> array['awd', 'ev', 'rwd', 'suv'] then
    raise exception 'FAIL: vocabulary should be exactly the keys in use: %', a -> 'vocabulary';
  end if;

  raise notice 'PASS: brand A''s subdomain returns brand A''s published, public data only';
end $$;

-- ---- 2. B's subdomain returns B only (the pair) ----
do $$
declare b jsonb := public.showroom_catalog('b-eg');
begin
  if b is null or b -> 'brand' ->> 'slug' <> 'brand-b' then
    raise exception 'FAIL: brand B''s showroom was not returned';
  end if;
  if b::text like '%22aa%' or b::text like '%22a0%' or b::text like '%22a1%' or b::text like '%pub/a/%' then
    raise exception 'CRITICAL: brand B''s showroom contains brand A''s rows';
  end if;
  raise notice 'PASS: brand B''s subdomain returns brand B only';
end $$;

-- ---- 3. non-live market, non-live brand, unknown or mis-cased subdomain: NULL ----
do $$
begin
  if public.showroom_catalog('a-ae') is not null then
    raise exception 'CRITICAL: a dormant market returned a showroom';
  end if;
  if public.showroom_catalog('c-eg') is not null then
    raise exception 'CRITICAL: a brand that isn''t live returned a showroom';
  end if;
  if public.showroom_catalog('nobody') is not null or public.showroom_catalog('A-EG') is not null
     or public.showroom_catalog('') is not null or public.showroom_catalog(null) is not null then
    raise exception 'FAIL: an unknown subdomain returned a showroom';
  end if;
  raise notice 'PASS: non-live and unknown brand-markets return nothing';
end $$;

-- ---- 4. only the columns the page renders (exact key sets) ----
do $$
declare
  a jsonb := public.showroom_catalog('a-eg');
  keys text[];
begin
  select array_agg(k order by k) into keys from jsonb_object_keys(a) k;
  if keys <> array['assets','brand','market','models','prices','theme','trims','vocabulary'] then
    raise exception 'FAIL: unexpected top-level keys %', keys;
  end if;
  select array_agg(k order by k) into keys from jsonb_object_keys(a -> 'brand') k;
  if keys <> array['name','slug'] then raise exception 'FAIL: brand exposes %', keys; end if;
  select array_agg(k order by k) into keys from jsonb_object_keys(a -> 'market') k;
  if keys <> array['cities_ar','cities_en','contact_email','currency','footer_description_ar',
                   'footer_description_en','footer_link_columns','footer_tagline_ar','footer_tagline_en',
                   'hotline','lead_cities','locale','market_code','rtl','social_links','subdomain',
                   'whatsapp_number'] then
    raise exception 'FAIL: market exposes %', keys;
  end if;
  select array_agg(k order by k) into keys from jsonb_object_keys(a -> 'theme') k;
  if keys <> array['accent_hex','favicon_asset_ref','focus_hex','hover_hex','logo_dark_asset_ref',
                   'logo_light_asset_ref','muted_hex','on_accent'] then
    raise exception 'FAIL: theme exposes %', keys;
  end if;
  select array_agg(k order by k) into keys from jsonb_object_keys(a -> 'models' -> 0) k;
  if keys <> array['accel_0_100_s','badge_label','body_type','drive','efficiency_icon_kind',
                   'efficiency_label_ar','efficiency_label_en','efficiency_value','fuel','fuel_category',
                   'id','name_ar','name_en','order_index','power_hp','seats','slug','top_speed_kph',
                   'torque_nm','transmission','year'] then
    raise exception 'FAIL: models expose %', keys;
  end if;
  select array_agg(k order by k) into keys from jsonb_object_keys(a -> 'trims' -> 0) k;
  if keys <> array['accel_0_100_s','drive','id','model_id','name_ar','name_en','order_index',
                   'power_hp','seats','slug','top_speed_kph','torque_nm'] then
    raise exception 'FAIL: trims expose %', keys;
  end if;
  select array_agg(k order by k) into keys from jsonb_object_keys(a -> 'assets' -> 0) k;
  if keys <> array['height','model_id','public_path','trim_id','view_key','width'] then
    raise exception 'FAIL: assets expose %', keys;
  end if;
  raise notice 'PASS: the read returns exactly the page-rendered columns';
end $$;

-- ---- 5. anon still reads no table directly ----
do $$
declare n int;
begin
  select (select count(*) from public.brand_markets) + (select count(*) from public.models)
       + (select count(*) from public.trims) + (select count(*) from public.trim_prices)
       + (select count(*) from public.assets) + (select count(*) from public.brand_themes)
    into n;
  if n <> 0 then raise exception 'CRITICAL: anon reads catalogue tables directly (% rows)', n; end if;
  raise notice 'PASS: table RLS unchanged; the function is anon''s only path';
exception when insufficient_privilege then
  raise notice 'PASS: table RLS unchanged; the function is anon''s only path';
end $$;
reset role;

-- ---- 6. only anon may execute it ----
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000022d1","role":"authenticated"}', true);
do $$
declare msg text;
begin
  msg := test_helpers.try($q$select public.showroom_catalog('a-eg')$q$);
  if msg not like '%permission denied%' then
    raise exception 'FAIL: authenticated may execute showroom_catalog (%)', coalesce(nullif(msg, ''), 'no error');
  end if;
  raise notice 'PASS: EXECUTE is granted to anon only';
end $$;
reset role;

-- ---- 6b. a live brand that gets paused disappears at once ----
update public.brands set status = 'paused' where id = '00000000-0000-0000-0000-0000000022bb';
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$
begin
  if public.showroom_catalog('b-eg') is not null then
    raise exception 'CRITICAL: a paused brand returned a showroom';
  end if;
  raise notice 'PASS: a paused brand returns nothing';
end $$;
reset role;

-- ---- 7. canonical subdomains and safe public paths ----
do $$
declare msg text;
begin
  msg := test_helpers.try($q$update public.brand_markets set subdomain = 'A-EG' where subdomain = 'a-eg'$q$);
  if msg not like '%brand_markets_subdomain_format%' then
    raise exception 'FAIL: a mixed-case subdomain was stored (%)', msg;
  end if;
  msg := test_helpers.try($q$update public.brand_markets set subdomain = 'a.eg' where subdomain = 'a-eg'$q$);
  if msg not like '%brand_markets_subdomain_format%' then
    raise exception 'FAIL: a multi-label subdomain was stored (%)', msg;
  end if;
  msg := test_helpers.try($q$update public.assets set public_path = '../private/x.png' where public_path = 'pub/a/base-side.png'$q$);
  if msg not like '%assets_public_path_format%' then
    raise exception 'FAIL: a traversing public_path was stored (%)', msg;
  end if;
  msg := test_helpers.try($q$update public.assets set public_path = 'https://evil.test/x.png' where public_path = 'pub/a/base-side.png'$q$);
  if msg not like '%assets_public_path_format%' then
    raise exception 'FAIL: an absolute URL was stored as public_path (%)', msg;
  end if;
  raise notice 'PASS: subdomains are canonical and public paths are safe relative keys';
end $$;

rollback;
