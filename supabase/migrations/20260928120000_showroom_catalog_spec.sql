-- 20260928120000_showroom_catalog_spec.sql
-- PAGE-CONSUMER-SHOWROOM slice 5 (spec drawer, spec §5.8): the anonymous showroom read also returns
-- the spec ledger (tabs → groups → rows) of the PUBLISHED models it already returns. ADR 0018,
-- amended.
--
-- Within the owner's read-path conditions (#build-decisions 2026-09-26, option A):
--   1. Page-rendered columns only: the drawer shows tab titles, group titles and notes, row keys and
--      values. No brand id, no timestamps.
--   2. No asset paths are added.
--   3. The paired test (0025) proves brand A's subdomain never returns brand B's ledger, an
--      unpublished model's ledger never appears, and a per-trim value keyed to an UNPUBLISHED trim is
--      stripped (trim_values is keyed by trim id, so it could otherwise leak a pre-launch trim's
--      figures, and its id).
--   4. ADR 0018 amendment.
--
-- Per-trim values are rebuilt as {en, ar} only, so nothing else stored in the jsonb can pass through.
-- The function body is otherwise unchanged from 20260926170000; grants and comment are re-stated.

create or replace function public.showroom_catalog(p_subdomain text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $fn$
  with bm as (
    select bm.*
      from public.brand_markets bm
      join public.brands b on b.id = bm.brand_id
     where bm.subdomain = p_subdomain
       and bm.live
       and b.status = 'live'
  ),
  m as (
    select mo.* from public.models mo
      join bm on mo.brand_id = bm.brand_id
     where mo.publish_state = 'published'
  ),
  t as (
    select tr.* from public.trims tr
      join m on tr.model_id = m.id and tr.brand_id = m.brand_id
     where tr.publish_state = 'published'
  ),
  used_keys as (
    select unnest(array[m.body_type, m.fuel, m.fuel_category, m.drive, m.transmission]) as id from m
    union
    select t.drive from t
  ),
  -- The spec ledger of the published models only (joined on model AND brand, as everywhere above).
  st as (
    select s.* from public.spec_tabs s
      join m on s.model_id = m.id and s.brand_id = m.brand_id
  ),
  sg as (
    select g.* from public.spec_groups g
      join st on g.tab_id = st.id and g.model_id = st.model_id and g.brand_id = st.brand_id
  ),
  sr as (
    select r.* from public.spec_rows r
      join sg on r.group_id = sg.id and r.model_id = sg.model_id and r.brand_id = sg.brand_id
  )
  select jsonb_build_object(
    'brand', (
      select jsonb_build_object('slug', b.slug, 'name', b.name)
        from public.brands b join bm on b.id = bm.brand_id),
    'market', (
      select jsonb_build_object(
        'market_code', bm.market_code, 'currency', bm.currency, 'locale', bm.locale, 'rtl', bm.rtl,
        'subdomain', bm.subdomain, 'whatsapp_number', bm.whatsapp_number,
        'footer_description_en', bm.footer_description_en,
        'footer_description_ar', bm.footer_description_ar,
        'footer_tagline_en', bm.footer_tagline_en, 'footer_tagline_ar', bm.footer_tagline_ar,
        'footer_link_columns', bm.footer_link_columns, 'social_links', bm.social_links,
        'hotline', bm.hotline, 'contact_email', bm.contact_email,
        'cities_en', bm.cities_en, 'cities_ar', bm.cities_ar, 'lead_cities', bm.lead_cities)
        from bm),
    'theme', (
      select jsonb_build_object(
        'accent_hex', th.accent_hex, 'on_accent', th.on_accent, 'hover_hex', th.hover_hex,
        'muted_hex', th.muted_hex, 'focus_hex', th.focus_hex,
        'logo_light_asset_ref', th.logo_light_asset_ref,
        'logo_dark_asset_ref', th.logo_dark_asset_ref,
        'favicon_asset_ref', th.favicon_asset_ref)
        from public.brand_themes th join bm on th.brand_id = bm.brand_id and th.market_code = bm.market_code),
    'models', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id, 'slug', m.slug, 'name_en', m.name_en, 'name_ar', m.name_ar, 'year', m.year,
        'badge_label', m.badge_label, 'body_type', m.body_type, 'fuel', m.fuel,
        'fuel_category', m.fuel_category, 'drive', m.drive, 'transmission', m.transmission,
        'seats', m.seats, 'accel_0_100_s', m.accel_0_100_s, 'power_hp', m.power_hp,
        'top_speed_kph', m.top_speed_kph, 'torque_nm', m.torque_nm,
        'efficiency_label_en', m.efficiency_label_en, 'efficiency_label_ar', m.efficiency_label_ar,
        'efficiency_value', m.efficiency_value, 'efficiency_icon_kind', m.efficiency_icon_kind,
        'order_index', m.order_index) order by m.order_index, m.slug)
        from m), '[]'::jsonb),
    'trims', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id, 'model_id', t.model_id, 'slug', t.slug, 'name_en', t.name_en,
        'name_ar', t.name_ar, 'drive', t.drive, 'seats', t.seats,
        'accel_0_100_s', t.accel_0_100_s, 'power_hp', t.power_hp,
        'top_speed_kph', t.top_speed_kph, 'torque_nm', t.torque_nm,
        'order_index', t.order_index) order by t.model_id, t.order_index, t.slug)
        from t), '[]'::jsonb),
    -- This market's prices only; currency is the market's (price_amount, #67).
    'prices', coalesce((
      select jsonb_agg(jsonb_build_object(
        'trim_id', p.trim_id, 'price_amount', p.price_amount, 'on_request', p.on_request)
        order by p.trim_id)
        from public.trim_prices p
        join t on p.trim_id = t.id and p.brand_id = t.brand_id
        join bm on p.brand_id = bm.brand_id and p.market_code = bm.market_code), '[]'::jsonb),
    -- Card (side) and hero (front-34) images of published models and trims, public copies only.
    -- Per-colour renders are left out: without their colour key the page couldn't choose one, and
    -- colour belongs to the configurator.
    'assets', coalesce((
      select jsonb_agg(jsonb_build_object(
        'model_id', a.model_id, 'trim_id', a.trim_id, 'view_key', a.view_key,
        'public_path', a.public_path, 'width', a.width, 'height', a.height)
        order by a.public_path)
        from public.assets a
        join m on a.model_id = m.id and a.brand_id = m.brand_id
       where a.public_path is not null
         and a.kind in ('render', 'image')
         and a.view_key in ('side', 'front-34')
         and (a.trim_id is null or exists (select 1 from t where t.id = a.trim_id))), '[]'::jsonb),
    -- Display names for the attribute keys this catalogue uses (vocabulary decision, #69).
    'vocabulary', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', v.id, 'kind', v.kind, 'display_en', v.display_en, 'display_ar', v.display_ar)
        order by v.kind, v.id)
        from public.vocabulary_registry v
       where v.id in (select id from used_keys where id is not null)
         and v.kind in ('body_type', 'fuel', 'drive', 'transmission')), '[]'::jsonb),
    -- The spec ledger (slice 5, spec §5.8). The drawer resolves a row for one trim
    -- (resolveLedgerRow): the shared value of an all-trims row, or that trim's entry.
    'spec', jsonb_build_object(
      'tabs', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', st.id, 'model_id', st.model_id, 'key', st.key,
          'title_en', st.title_en, 'title_ar', st.title_ar, 'order_index', st.order_index)
          order by st.model_id, st.order_index, st.key)
          from st), '[]'::jsonb),
      'groups', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', sg.id, 'tab_id', sg.tab_id, 'model_id', sg.model_id,
          'title_en', sg.title_en, 'title_ar', sg.title_ar,
          'note_en', sg.note_en, 'note_ar', sg.note_ar, 'order_index', sg.order_index)
          order by sg.model_id, sg.tab_id, sg.order_index, sg.id)
          from sg), '[]'::jsonb),
      'rows', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', sr.id, 'group_id', sr.group_id, 'model_id', sr.model_id,
          'key_en', sr.key_en, 'key_ar', sr.key_ar, 'scope', sr.scope,
          'value_en', sr.value_en, 'value_ar', sr.value_ar,
          -- Per-trim values of PUBLISHED trims only, rebuilt as {en, ar}.
          'trim_values', case when sr.scope = 'per_trim' then coalesce((
              select jsonb_object_agg(e.key, jsonb_build_object('en', e.value ->> 'en', 'ar', e.value ->> 'ar'))
                from jsonb_each(sr.trim_values) e
               where e.key in (select t.id::text from t where t.model_id = sr.model_id)
            ), '{}'::jsonb) end,
          'order_index', sr.order_index)
          order by sr.model_id, sr.group_id, sr.order_index, sr.id)
          from sr), '[]'::jsonb)
    )
  )
  where exists (select 1 from bm)
$fn$;

revoke execute on function public.showroom_catalog(text) from public, anon, authenticated, service_role;
grant  execute on function public.showroom_catalog(text) to anon;

comment on function public.showroom_catalog(text) is
  'Anonymous showroom read (ADR 0018): one live brand-market''s published catalogue by subdomain, '
  'page-rendered columns only, public asset copies only, and the spec ledger of published models '
  '(per-trim values of published trims only). NULL when there is none.';
