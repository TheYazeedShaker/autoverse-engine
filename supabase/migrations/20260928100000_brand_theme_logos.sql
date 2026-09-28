-- 20260928100000_brand_theme_logos.sql
-- Brand logos (owner decision, #build-decisions 2026-09-28; ADR 0024). The theme's logo refs are
-- object keys in the public published bucket, under the asset standard (ADR 0022):
--
--   {brand}/_brand/logo-light.{hash8}.{svg|png}   the light-coloured mark, for dark surfaces (TopBar)
--   {brand}/_brand/logo-dark.{hash8}.{svg|png}    the dark mark, for light surfaces
--
-- - Content-hashed, never reused (ADR 0022). SVG or PNG only. The page renders them with <img>, never
--   inline SVG, so a logo can't run script in the page.
-- - `_brand` can't collide with a model folder: model slugs are [a-z0-9-] only.
-- - {brand} must be the row's own brand slug (a trigger: a CHECK can't read `brands`), so one brand's
--   theme can never point at another brand's files.
-- - No logo (null) keeps the brand name as the wordmark.
--
-- Pre-check on the hosted DB before merging (must return 0 rows; the columns were free text):
--   select brand_id, market_code, logo_light_asset_ref, logo_dark_asset_ref from public.brand_themes
--    where logo_light_asset_ref is not null or logo_dark_asset_ref is not null;

alter table public.brand_themes
  add constraint brand_themes_logo_light_format check (
    logo_light_asset_ref is null
    or logo_light_asset_ref ~ '^[a-z0-9]+(-[a-z0-9]+)*/_brand/logo-light\.[0-9a-f]{8}\.(svg|png)$'
  ),
  add constraint brand_themes_logo_dark_format check (
    logo_dark_asset_ref is null
    or logo_dark_asset_ref ~ '^[a-z0-9]+(-[a-z0-9]+)*/_brand/logo-dark\.[0-9a-f]{8}\.(svg|png)$'
  );

comment on column public.brand_themes.logo_light_asset_ref is
  'ADR 0024: public-bucket key {brand}/_brand/logo-light.{hash8}.{svg|png}; the light mark for dark surfaces. Null = brand-name wordmark.';
comment on column public.brand_themes.logo_dark_asset_ref is
  'ADR 0024: public-bucket key {brand}/_brand/logo-dark.{hash8}.{svg|png}; the dark mark for light surfaces. Null = brand-name wordmark.';

-- The logo's brand folder must be the theme's own brand.
create or replace function app_auth.brand_theme_logos_own_brand()
returns trigger
language plpgsql
set search_path = ''
as $fn$
declare
  own_slug text;
begin
  if new.logo_light_asset_ref is null and new.logo_dark_asset_ref is null then
    return new;
  end if;
  select b.slug into own_slug from public.brands b where b.id = new.brand_id;
  if own_slug is null then
    raise exception 'brand_theme_logo_brand_unknown' using errcode = '23503';
  end if;
  if (new.logo_light_asset_ref is not null and split_part(new.logo_light_asset_ref, '/', 1) <> own_slug)
     or (new.logo_dark_asset_ref is not null and split_part(new.logo_dark_asset_ref, '/', 1) <> own_slug) then
    raise exception 'brand_theme_logo_other_brand' using errcode = '23514';
  end if;
  return new;
end
$fn$;

create trigger brand_themes_logos_own_brand
  before insert or update of logo_light_asset_ref, logo_dark_asset_ref, brand_id
  on public.brand_themes
  for each row execute function app_auth.brand_theme_logos_own_brand();

-- A brand's slug can't change while its themes reference logo keys in its folder: the keys would
-- point at the old folder, which another brand could later take. Clear (or re-register) the logos
-- first (runbook, "Brand logos").
create or replace function app_auth.brands_slug_logo_guard()
returns trigger
language plpgsql
set search_path = ''
as $fn$
begin
  if new.slug is distinct from old.slug and exists (
    select 1 from public.brand_themes t
     where t.brand_id = old.id
       and (t.logo_light_asset_ref is not null or t.logo_dark_asset_ref is not null)
  ) then
    raise exception 'brand_slug_has_logos' using errcode = '23514';
  end if;
  return new;
end
$fn$;

create trigger brands_slug_logo_guard
  before update of slug on public.brands
  for each row execute function app_auth.brands_slug_logo_guard();
