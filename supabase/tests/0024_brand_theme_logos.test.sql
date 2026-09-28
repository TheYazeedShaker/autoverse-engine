-- 0024_brand_theme_logos.test.sql
-- Migration 20260928100000_brand_theme_logos.sql (ADR 0024). Proves:
--   * a logo ref is a content-hashed public-bucket key under the brand's own `_brand/` folder,
--     SVG or PNG only, with the right variant name (light / dark);
--   * a theme can never point at ANOTHER brand's logo (cross-tenant), on insert or update, and
--     moving a theme's row to another brand re-checks it; a brand with logos can't change its slug;
--   * null (no logo, the wordmark) is allowed.
-- A violation RAISES EXCEPTION. Rolls back, so no fixture data persists.

begin;

create schema test_helpers;
create function test_helpers.try(stmt text) returns text language plpgsql as $$
begin
  execute stmt;
  return '';
exception when others then
  return sqlerrm;
end $$;

insert into public.brands (id, slug, name, status) values
  ('00000000-0000-0000-0000-0000000024aa', 'brand-a', 'Brand A', 'live'),
  ('00000000-0000-0000-0000-0000000024bb', 'brand-b', 'Brand B', 'live');
insert into public.brand_markets (brand_id, market_code, currency, locale, live, subdomain) values
  ('00000000-0000-0000-0000-0000000024aa', 'EG', 'EGP', 'ar-EG', true, 'a24-eg'),
  ('00000000-0000-0000-0000-0000000024bb', 'EG', 'EGP', 'ar-EG', true, 'b24-eg');
insert into public.brand_themes (brand_id, market_code, accent_hex, on_accent, hover_hex, muted_hex, focus_hex) values
  ('00000000-0000-0000-0000-0000000024aa', 'EG', '#1F4E8C', 'white', '#173B69', '#DCE4EE', '#1F4E8C'),
  ('00000000-0000-0000-0000-0000000024bb', 'EG', '#7A1F2B', 'white', '#5E1721', '#EEDCDF', '#7A1F2B');

do $$
declare msg text;
  set_a constant text := $q$update public.brand_themes set %s where brand_id = '00000000-0000-0000-0000-0000000024aa'$q$;
begin
  -- Accepted: both variants, SVG and PNG, content-hashed, in the brand's own folder.
  msg := test_helpers.try(format(set_a,
    $v$logo_light_asset_ref = 'brand-a/_brand/logo-light.a1b2c3d4.svg', logo_dark_asset_ref = 'brand-a/_brand/logo-dark.0f9e8d7c.png'$v$));
  if msg <> '' then raise exception 'FAIL: a valid logo pair was refused (%)', msg; end if;

  -- Accepted: back to none (the wordmark).
  msg := test_helpers.try(format(set_a, 'logo_light_asset_ref = null, logo_dark_asset_ref = null'));
  if msg <> '' then raise exception 'FAIL: clearing the logos was refused (%)', msg; end if;

  -- Refused: another brand's folder (cross-tenant).
  msg := test_helpers.try(format(set_a, $v$logo_light_asset_ref = 'brand-b/_brand/logo-light.a1b2c3d4.svg'$v$));
  if msg not like '%brand_theme_logo_other_brand%' then
    raise exception 'FAIL: brand A pointed at brand B''s logo (%)', msg;
  end if;

  -- Refused: formats the standard doesn't allow.
  msg := test_helpers.try(format(set_a, $v$logo_light_asset_ref = 'brand-a/_brand/logo-light.a1b2c3d4.jpg'$v$));
  if msg not like '%brand_themes_logo_light_format%' then raise exception 'FAIL: a JPG logo was stored (%)', msg; end if;
  msg := test_helpers.try(format(set_a, $v$logo_light_asset_ref = 'brand-a/_brand/logo-light.svg'$v$));
  if msg not like '%brand_themes_logo_light_format%' then raise exception 'FAIL: an unhashed name was stored (%)', msg; end if;
  msg := test_helpers.try(format(set_a, $v$logo_light_asset_ref = 'brand-a/_brand/logo-dark.a1b2c3d4.svg'$v$));
  if msg not like '%brand_themes_logo_light_format%' then raise exception 'FAIL: the dark mark was stored as the light one (%)', msg; end if;
  msg := test_helpers.try(format(set_a, $v$logo_dark_asset_ref = 'https://evil.example/logo-dark.a1b2c3d4.svg'$v$));
  -- Refused either way: the brand-folder trigger runs before the CHECK, so either may report it.
  if msg not like '%brand_themes_logo_dark_format%' and msg not like '%brand_theme_logo_other_brand%' then
    raise exception 'FAIL: a URL was stored as a logo (%)', msg;
  end if;
  msg := test_helpers.try(format(set_a, $v$logo_dark_asset_ref = 'brand-a/models/logo-dark.a1b2c3d4.svg'$v$));
  if msg not like '%brand_themes_logo_dark_format%' then raise exception 'FAIL: a logo outside _brand/ was stored (%)', msg; end if;

  -- Refused on insert too: a new theme row for brand B pointing at brand A's logo.
  delete from public.brand_themes where brand_id = '00000000-0000-0000-0000-0000000024bb';
  msg := test_helpers.try($q$insert into public.brand_themes
      (brand_id, market_code, accent_hex, on_accent, hover_hex, muted_hex, focus_hex, logo_light_asset_ref)
    values ('00000000-0000-0000-0000-0000000024bb', 'EG', '#7A1F2B', 'white', '#5E1721', '#EEDCDF', '#7A1F2B',
            'brand-a/_brand/logo-light.a1b2c3d4.svg')$q$);
  if msg not like '%brand_theme_logo_other_brand%' then
    raise exception 'FAIL: a new theme for brand B used brand A''s logo (%)', msg;
  end if;

  -- Refused: moving brand A's themed row to brand B while it carries brand A's logo.
  msg := test_helpers.try(format(set_a, $v$logo_light_asset_ref = 'brand-a/_brand/logo-light.a1b2c3d4.svg'$v$));
  if msg <> '' then raise exception 'FAIL: setting brand A''s own logo was refused (%)', msg; end if;
  msg := test_helpers.try(format(set_a, $v$brand_id = '00000000-0000-0000-0000-0000000024bb'$v$));
  if msg not like '%brand_theme_logo_other_brand%' then
    raise exception 'FAIL: a themed row moved to brand B kept brand A''s logo (%)', msg;
  end if;

  -- Refused: renaming brand A's slug while its theme references logos in its folder.
  msg := test_helpers.try($q$update public.brands set slug = 'brand-a2' where id = '00000000-0000-0000-0000-0000000024aa'$q$);
  if msg not like '%brand_slug_has_logos%' then
    raise exception 'FAIL: brand A was renamed while its logos pointed at the old folder (%)', msg;
  end if;
  -- Allowed once the logos are cleared.
  msg := test_helpers.try(format(set_a, 'logo_light_asset_ref = null, logo_dark_asset_ref = null'));
  msg := test_helpers.try($q$update public.brands set slug = 'brand-a2' where id = '00000000-0000-0000-0000-0000000024aa'$q$);
  if msg <> '' then raise exception 'FAIL: renaming a brand without logos was refused (%)', msg; end if;

  raise notice 'PASS: logos are hashed SVG/PNG keys in the theme''s own brand folder';
end $$;

rollback;
