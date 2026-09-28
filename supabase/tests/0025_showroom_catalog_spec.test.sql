-- 0025_showroom_catalog_spec.test.sql
-- MANDATORY isolation test for migration 20260928120000_showroom_catalog_spec.sql (ADR 0018,
-- amended). Proves, calling public.showroom_catalog as anon (as the page does):
--   * brand A's subdomain never returns brand B's ledger (not even its ids), and vice versa;
--   * an unpublished model's ledger never appears;
--   * a per-trim value keyed to an UNPUBLISHED trim is stripped (no pre-launch figures, no trim id);
--   * per-trim values come back as {en, ar} only, whatever else the stored jsonb holds;
--   * only the page-rendered keys (exact key sets for tabs, groups, rows).
-- A violation RAISES EXCEPTION. Rolls back, so no fixture data persists.

begin;

insert into public.brands (id, slug, name, status) values
  ('00000000-0000-0000-0000-0000000025aa', 'brand-a25', 'Brand A', 'live'),
  ('00000000-0000-0000-0000-0000000025bb', 'brand-b25', 'Brand B', 'live');
insert into public.brand_markets (brand_id, market_code, currency, locale, live, subdomain) values
  ('00000000-0000-0000-0000-0000000025aa', 'EG', 'EGP', 'ar-EG', true, 'a25-eg'),
  ('00000000-0000-0000-0000-0000000025bb', 'EG', 'EGP', 'ar-EG', true, 'b25-eg');

insert into public.models (id, brand_id, slug, name_en, name_ar, publish_state) values
  ('00000000-0000-0000-0000-00000025a001', '00000000-0000-0000-0000-0000000025aa', 'a-pub',   'A Pub',   'أ', 'published'),
  ('00000000-0000-0000-0000-00000025a002', '00000000-0000-0000-0000-0000000025aa', 'a-draft', 'A Draft', 'أ', 'draft'),
  ('00000000-0000-0000-0000-00000025b001', '00000000-0000-0000-0000-0000000025bb', 'b-pub',   'B Pub',   'ب', 'published');
insert into public.trims (id, brand_id, model_id, slug, name_en, name_ar, publish_state) values
  ('00000000-0000-0000-0000-00000025a101', '00000000-0000-0000-0000-0000000025aa', '00000000-0000-0000-0000-00000025a001', 'base',   'Base',   'أ', 'published'),
  ('00000000-0000-0000-0000-00000025a102', '00000000-0000-0000-0000-0000000025aa', '00000000-0000-0000-0000-00000025a001', 'secret', 'Secret', 'أ', 'draft'),
  ('00000000-0000-0000-0000-00000025b101', '00000000-0000-0000-0000-0000000025bb', '00000000-0000-0000-0000-00000025b001', 'base',   'Base',   'ب', 'published');

insert into public.spec_tabs (id, brand_id, model_id, key, title_en, title_ar, order_index) values
  ('00000000-0000-0000-0000-00000025a0a1', '00000000-0000-0000-0000-0000000025aa', '00000000-0000-0000-0000-00000025a001', 'tech', 'Technical data', 'البيانات الفنية', 1),
  ('00000000-0000-0000-0000-00000025a0a2', '00000000-0000-0000-0000-0000000025aa', '00000000-0000-0000-0000-00000025a002', 'tech', 'Draft tech', 'مسودة', 1),
  ('00000000-0000-0000-0000-00000025b0a1', '00000000-0000-0000-0000-0000000025bb', '00000000-0000-0000-0000-00000025b001', 'tech', 'B tech', 'ب', 1);
insert into public.spec_groups (id, brand_id, model_id, tab_id, title_en, title_ar, note_en, note_ar, order_index) values
  ('00000000-0000-0000-0000-00000025a0b1', '00000000-0000-0000-0000-0000000025aa', '00000000-0000-0000-0000-00000025a001', '00000000-0000-0000-0000-00000025a0a1', 'Performance', 'الأداء', 'WLTP', 'WLTP', 1),
  ('00000000-0000-0000-0000-00000025a0b2', '00000000-0000-0000-0000-0000000025aa', '00000000-0000-0000-0000-00000025a002', '00000000-0000-0000-0000-00000025a0a2', 'Draft group', 'مسودة', null, null, 1),
  ('00000000-0000-0000-0000-00000025b0b1', '00000000-0000-0000-0000-0000000025bb', '00000000-0000-0000-0000-00000025b001', '00000000-0000-0000-0000-00000025b0a1', 'B group', 'ب', null, null, 1);
insert into public.spec_rows (id, brand_id, model_id, group_id, key_en, key_ar, scope, value_en, value_ar, trim_values, order_index) values
  ('00000000-0000-0000-0000-00000025a0c1', '00000000-0000-0000-0000-0000000025aa', '00000000-0000-0000-0000-00000025a001', '00000000-0000-0000-0000-00000025a0b1',
   'Top speed', 'السرعة القصوى', 'all_trims', '210 km/h', '210 كم/س', null, 1),
  ('00000000-0000-0000-0000-00000025a0c2', '00000000-0000-0000-0000-0000000025aa', '00000000-0000-0000-0000-00000025a001', '00000000-0000-0000-0000-00000025a0b1',
   'Power', 'القوة', 'per_trim', null, null,
   jsonb_build_object(
     '00000000-0000-0000-0000-00000025a101', jsonb_build_object('en', '420 hp', 'ar', '420 حصان', 'internal', 'cost-sheet-7'),
     '00000000-0000-0000-0000-00000025a102', jsonb_build_object('en', '600 hp (unannounced)', 'ar', '600')), 2),
  ('00000000-0000-0000-0000-00000025a0c3', '00000000-0000-0000-0000-0000000025aa', '00000000-0000-0000-0000-00000025a002', '00000000-0000-0000-0000-00000025a0b2',
   'Draft row', 'مسودة', 'all_trims', 'hidden', 'hidden', null, 1),
  ('00000000-0000-0000-0000-00000025b0c1', '00000000-0000-0000-0000-0000000025bb', '00000000-0000-0000-0000-00000025b001', '00000000-0000-0000-0000-00000025b0b1',
   'B row', 'ب', 'all_trims', 'b-value', 'b-value', null, 1);

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

do $$
declare
  a jsonb := public.showroom_catalog('a25-eg');
  b jsonb := public.showroom_catalog('b25-eg');
  txt text;
  keys text[];
  power jsonb;
begin
  -- ---- cross-tenant: A's read holds nothing of B's, and B's nothing of A's ----
  txt := (a -> 'spec')::text;
  if txt like '%00000025b0%' or txt like '%b-value%' or txt like '%B tech%' then
    raise exception 'FAIL: brand A''s read carries brand B''s ledger: %', a -> 'spec';
  end if;
  txt := (b -> 'spec')::text;
  if txt like '%00000025a0%' or txt like '%Technical data%' or txt like '%420 hp%' then
    raise exception 'FAIL: brand B''s read carries brand A''s ledger: %', b -> 'spec';
  end if;

  -- ---- only the published model's ledger ----
  if jsonb_array_length(a -> 'spec' -> 'tabs') <> 1
     or jsonb_array_length(a -> 'spec' -> 'groups') <> 1
     or jsonb_array_length(a -> 'spec' -> 'rows') <> 2 then
    raise exception 'FAIL: expected 1 tab, 1 group, 2 rows for A''s published model: %', a -> 'spec';
  end if;
  if (a -> 'spec')::text like '%Draft%' or (a -> 'spec')::text like '%hidden%' then
    raise exception 'FAIL: an unpublished model''s ledger leaked: %', a -> 'spec';
  end if;

  -- ---- per-trim: unpublished trims stripped; values rebuilt as {en, ar} ----
  select r -> 'trim_values' into power
    from jsonb_array_elements(a -> 'spec' -> 'rows') r where r ->> 'key_en' = 'Power';
  if power ? '00000000-0000-0000-0000-00000025a102' or power::text like '%unannounced%' then
    raise exception 'FAIL: a draft trim''s per-trim value leaked: %', power;
  end if;
  if power -> '00000000-0000-0000-0000-00000025a101' <> '{"en": "420 hp", "ar": "420 حصان"}'::jsonb then
    raise exception 'FAIL: the published trim''s value should be exactly {en, ar}: %', power;
  end if;
  if power::text like '%cost-sheet%' then
    raise exception 'FAIL: an extra key in trim_values passed through: %', power;
  end if;

  -- ---- exact key sets ----
  select array_agg(k order by k) into keys from jsonb_object_keys(a -> 'spec') k;
  if keys <> array['groups','rows','tabs'] then raise exception 'FAIL: spec exposes %', keys; end if;
  select array_agg(k order by k) into keys from jsonb_object_keys(a -> 'spec' -> 'tabs' -> 0) k;
  if keys <> array['id','key','model_id','order_index','title_ar','title_en'] then
    raise exception 'FAIL: tabs expose %', keys;
  end if;
  select array_agg(k order by k) into keys from jsonb_object_keys(a -> 'spec' -> 'groups' -> 0) k;
  if keys <> array['id','model_id','note_ar','note_en','order_index','tab_id','title_ar','title_en'] then
    raise exception 'FAIL: groups expose %', keys;
  end if;
  select array_agg(k order by k) into keys from jsonb_object_keys(a -> 'spec' -> 'rows' -> 0) k;
  if keys <> array['group_id','id','key_ar','key_en','model_id','order_index','scope','trim_values',
                   'value_ar','value_en'] then
    raise exception 'FAIL: rows expose %', keys;
  end if;

  raise notice 'PASS: the ledger is per brand, published models only, published trims only';
end $$;

reset role;
rollback;
