-- 20260926170000_showroom_catalog_read.sql
-- PAGE-CONSUMER-SHOWROOM: how an anonymous visitor's page reads the published catalogue. ADR 0018.
--
-- Owner decision (#build-decisions, 2026-09-26, option A with four conditions): one narrow
-- SECURITY DEFINER read function for anon, following ADR 0013's pattern. Table RLS stays unchanged:
-- anon still cannot select from any table. The owner's conditions, all enforced here:
--   1. Only the columns the page renders. No internal ids beyond what the page needs to join rows
--      (model, trim) and to name them in a lead or event later. No brand id. Nothing from
--      brand_market_private.
--   2. Asset paths only for the PUBLIC, PUBLISHED bucket (images decision: drafts and pre-launch
--      renders stay private, and are copied to the public bucket at publish). See assets.public_path.
--   3. A paired cross-tenant test (0022): brand A's subdomain never returns brand B's rows, and a
--      non-live brand or market returns nothing.
--   4. ADR 0018.
--
-- Pinned search_path; EXECUTE revoked from PUBLIC (and Supabase's default grants) and granted to
-- anon only. It reads only published, live data, which the page shows to anyone anyway, so unlike
-- ADR 0013's writes it carries no gateway secret: calling it directly reveals nothing the page
-- doesn't. Its cost is bounded (one brand-market's catalogue) and anon's statement timeout applies.

-- ============================================================================================
-- 1. Subdomains: one canonical spelling, matching the consumer app's host parser (host.ts)
-- ============================================================================================
-- Lower-case DNS labels only. Today `subdomain` is just `text unique`, so 'Demo' and 'demo' could
-- both exist and neither would ever match a real (lower-cased) host.
alter table public.brand_markets
  add constraint brand_markets_subdomain_format
  check (subdomain is null or subdomain ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$');

-- ============================================================================================
-- 2. assets.public_path: where a published copy lives, if one does
-- ============================================================================================
-- `storage_path` is the file's place in the private structured store. `public_path` is set by the
-- publish step (1·B) when it copies the file into the public bucket, and cleared when a model is
-- unpublished. A null public_path means "not public": the read function never returns it, so an
-- embargoed render can't reach a page even by a guessed path.
alter table public.assets
  add column public_path text,
  -- A relative object key: no scheme, no leading slash, no '..' segment, no whitespace.
  add constraint assets_public_path_format check (
    public_path is null
    or (public_path ~ '^[A-Za-z0-9][A-Za-z0-9._/-]{0,511}$'
        and public_path !~ '(^|/)\.\.(/|$)'
        and public_path !~ '//')
  );

create unique index assets_public_path_key on public.assets (public_path) where public_path is not null;

comment on column public.assets.public_path is
  'Object key in the public published bucket. Set at publish (1·B), cleared at unpublish. '
  'Null = not public. The only asset path showroom_catalog returns (ADR 0018).';

-- ============================================================================================
-- 3. The read function
-- ============================================================================================
-- One brand-market's showroom, by subdomain, or NULL. NULL for an unknown subdomain, a brand that
-- isn't live and a market that isn't live alike, so a caller learns nothing about which brands or
-- markets exist.
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
    'assets', coalesce((
      select jsonb_agg(jsonb_build_object(
        'model_id', a.model_id, 'trim_id', a.trim_id, 'view_key', a.view_key,
        'public_path', a.public_path, 'width', a.width, 'height', a.height)
        order by a.public_path)
        from public.assets a
        join m on a.model_id = m.id and a.brand_id = m.brand_id
       where a.public_path is not null
         and a.kind in ('render', 'image', 'per_color_render')
         and a.view_key in ('side', 'front-34')
         and (a.trim_id is null or exists (select 1 from t where t.id = a.trim_id))), '[]'::jsonb),
    -- Display names for the attribute keys this catalogue uses (vocabulary decision, #69).
    'vocabulary', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', v.id, 'kind', v.kind, 'display_en', v.display_en, 'display_ar', v.display_ar)
        order by v.kind, v.id)
        from public.vocabulary_registry v
       where v.id in (select id from used_keys where id is not null)
         and v.kind in ('body_type', 'fuel', 'drive', 'transmission')), '[]'::jsonb)
  )
  where exists (select 1 from bm)
$fn$;

revoke execute on function public.showroom_catalog(text) from public, anon, authenticated, service_role;
grant  execute on function public.showroom_catalog(text) to anon;

comment on function public.showroom_catalog(text) is
  'Anonymous showroom read (ADR 0018): one live brand-market''s published catalogue by subdomain, '
  'page-rendered columns only, public asset copies only. NULL when there is none.';
