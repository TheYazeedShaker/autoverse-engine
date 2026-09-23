-- 20260922223000_theming.sql
-- ENGINE-CORE-1A · theming REV — a brand's visual identity is data, not code.
--
-- One row per (brand, market). The engine applies it server-side at render time: no per-brand CSS
-- files, no per-brand deploys, no client-side theme switching.
--
-- The REV says "no theme row can exist that fails AA" and makes the validate-theme edge function
-- the write gate. A gate you can walk around is not an invariant, so the AA checks live here too,
-- as CHECK constraints over a contrast function. The edge function derives the shades and returns a
-- readable 422; the database is what makes a failing row impossible.

-- ---------- contrast, in SQL ----------
-- WCAG 2.x relative luminance and contrast ratio. Immutable, so constraints may call it.
create or replace function app_auth.srgb_channel(v integer)
returns double precision language sql immutable set search_path = '' as $fn$
  select case
    when v / 255.0 <= 0.03928 then (v / 255.0) / 12.92
    else power(((v / 255.0) + 0.055) / 1.055, 2.4)
  end
$fn$;

create or replace function app_auth.relative_luminance(hex text)
returns double precision language sql immutable set search_path = '' as $fn$
  select 0.2126 * app_auth.srgb_channel(('x' || substr(hex, 2, 2))::bit(8)::integer)
       + 0.7152 * app_auth.srgb_channel(('x' || substr(hex, 4, 2))::bit(8)::integer)
       + 0.0722 * app_auth.srgb_channel(('x' || substr(hex, 6, 2))::bit(8)::integer)
$fn$;

create or replace function app_auth.contrast_ratio(a text, b text)
returns double precision language sql immutable set search_path = '' as $fn$
  select (greatest(app_auth.relative_luminance(a), app_auth.relative_luminance(b)) + 0.05)
       / (least(app_auth.relative_luminance(a), app_auth.relative_luminance(b)) + 0.05)
$fn$;

-- ---------- brand_themes ----------
create table public.brand_themes (
  brand_id                uuid not null,
  market_code             text not null,
  -- The only value a human picks. Everything else below is derived server-side.
  accent_hex              text not null,
  -- 'black' | 'white', derived — never user-set.
  on_accent               text not null,
  hover_hex               text not null,
  muted_hex               text not null,
  focus_hex               text not null,
  logo_light_asset_ref    text,
  logo_dark_asset_ref     text,
  favicon_asset_ref       text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  primary key (brand_id, market_code),
  foreign key (brand_id, market_code)
    references public.brand_markets (brand_id, market_code) on delete cascade,

  constraint brand_themes_on_accent_values check (on_accent in ('black', 'white')),
  constraint brand_themes_hex_formats check (
    accent_hex ~ '^#[0-9A-Fa-f]{6}$' and hover_hex ~ '^#[0-9A-Fa-f]{6}$'
    and muted_hex ~ '^#[0-9A-Fa-f]{6}$' and focus_hex ~ '^#[0-9A-Fa-f]{6}$'
  ),

  -- The four AA pairs from the REV. A row that fails any of them cannot exist.
  constraint brand_themes_aa_on_accent check (
    app_auth.contrast_ratio(case on_accent when 'black' then '#000000' else '#FFFFFF' end, accent_hex) >= 4.5
  ),
  constraint brand_themes_aa_on_hover check (
    app_auth.contrast_ratio(case on_accent when 'black' then '#000000' else '#FFFFFF' end, hover_hex) >= 4.5
  ),
  -- Accent used as text, on the Mist canvas and on a white surface.
  constraint brand_themes_aa_accent_on_canvas check (app_auth.contrast_ratio(accent_hex, '#F4F7F5') >= 4.5),
  constraint brand_themes_aa_accent_on_white  check (app_auth.contrast_ratio(accent_hex, '#FFFFFF') >= 4.5)
);

create trigger brand_themes_set_updated_at before update on public.brand_themes
  for each row execute function app_auth.set_updated_at();

-- ---------- RLS ----------
alter table public.brand_themes enable row level security;

create policy brand_themes_staff_read on public.brand_themes
  for select using ((select app_auth.is_autoverse_staff()));
create policy brand_themes_brand_read on public.brand_themes
  for select using (brand_id = (select app_auth.current_brand_id()));

-- No public read: the consumer surface is rendered server-side and the theme arrives as CSS custom
-- properties in the document head, so a browser never queries this table.
revoke insert, update, delete, truncate on public.brand_themes from anon, authenticated;
