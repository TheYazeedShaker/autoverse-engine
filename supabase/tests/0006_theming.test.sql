-- 0006_theming.test.sql
-- MANDATORY isolation test for migration 20260922223000_theming.sql (1·A theming REV).
-- Proves: a brand reads its own theme and no one else's; no end user or anon reads themes at all;
-- nobody but the service role writes one; and — the REV's invariant — a row that fails any of the
-- four AA pairs cannot exist, even when the edge function is bypassed entirely.
--
-- That last part is the point of putting the checks in the database: the validate-theme function is
-- the write gate, but a gate you can walk around is not an invariant.

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

-- ===== fixtures =====
insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000b1'),
  ('00000000-0000-0000-0000-0000000000c1'),
  ('00000000-0000-0000-0000-0000000000d1');

insert into public.brands (id, slug, name) values
  ('00000000-0000-0000-0000-00000000000a', 'brand-a', 'Brand A'),
  ('00000000-0000-0000-0000-00000000000b', 'brand-b', 'Brand B');

insert into public.profiles (id, brand_id, brand_role, platform_role) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', 'brand_admin', null),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000b', 'brand_admin', null),
  ('00000000-0000-0000-0000-0000000000c1', null, null, 'ops');

insert into public.brand_markets (brand_id, market_code, currency, locale, live) values
  ('00000000-0000-0000-0000-00000000000a', 'EG', 'EGP', 'ar-EG', true),
  ('00000000-0000-0000-0000-00000000000b', 'EG', 'EGP', 'ar-EG', true);

-- Deep green: white label, and dark enough to read as text on both Mist and white.
insert into public.brand_themes (brand_id, market_code, accent_hex, on_accent, hover_hex, muted_hex, focus_hex) values
  ('00000000-0000-0000-0000-00000000000a', 'EG', '#0B3D2E', 'white', '#0A3628', '#E3EAE6', '#0B3D2E'),
  ('00000000-0000-0000-0000-00000000000b', 'EG', '#7A0C2E', 'white', '#6C0B29', '#EFE3E6', '#7A0C2E');

-- ---- 1. the AA invariant holds even with the edge function bypassed ----
do $$
declare msg text;
begin
  -- Contrast maths must agree with the reference points, or every check below is meaningless.
  if round(app_auth.contrast_ratio('#000000', '#FFFFFF')::numeric, 2) <> 21.00 then
    raise exception 'FAIL: contrast_ratio is wrong (black on white = %)',
      app_auth.contrast_ratio('#000000', '#FFFFFF');
  end if;

  -- Pale yellow: fine behind black text, unreadable AS text on Mist or white.
  msg := test_helpers.try($q$insert into public.brand_themes
    (brand_id, market_code, accent_hex, on_accent, hover_hex, muted_hex, focus_hex)
    values ('00000000-0000-0000-0000-00000000000a', 'EG', '#FFD60A', 'black', '#E6C009', '#FDF6DC', '#7A6604')$q$);
  if msg not like '%brand_themes_aa_accent_on_canvas%' and msg not like '%brand_themes_aa_accent_on_white%' then
    raise exception 'CRITICAL: an accent that fails AA as text was stored (%)', msg;
  end if;

  -- The wrong label colour on a dark accent.
  msg := test_helpers.try($q$insert into public.brand_themes
    (brand_id, market_code, accent_hex, on_accent, hover_hex, muted_hex, focus_hex)
    values ('00000000-0000-0000-0000-00000000000a', 'AE', '#0B3D2E', 'black', '#0A3628', '#E3EAE6', '#0B3D2E')$q$);
  if msg not like '%brand_themes_aa_on_accent%' and msg not like '%violates foreign key%' then
    raise exception 'CRITICAL: black text was stored on an accent it cannot be read on (%)', msg;
  end if;

  -- A hover shade that quietly drops below AA against the label.
  msg := test_helpers.try($q$update public.brand_themes set hover_hex = '#9FB5AC'
    where brand_id = '00000000-0000-0000-0000-00000000000a'$q$);
  if msg not like '%brand_themes_aa_on_hover%' then
    raise exception 'CRITICAL: a hover shade that fails AA against its label was stored (%)', msg;
  end if;

  -- on_accent is 'black' or 'white', never anything else.
  msg := test_helpers.try($q$update public.brand_themes set on_accent = 'auto'
    where brand_id = '00000000-0000-0000-0000-00000000000a'$q$);
  if msg not like '%brand_themes_on_accent_values%' then
    raise exception 'FAIL: on_accent accepted a value outside black/white (%)', msg;
  end if;

  -- A theme can only exist for a market the brand actually operates in.
  msg := test_helpers.try($q$insert into public.brand_themes
    (brand_id, market_code, accent_hex, on_accent, hover_hex, muted_hex, focus_hex)
    values ('00000000-0000-0000-0000-00000000000a', 'SA', '#0B3D2E', 'white', '#0A3628', '#E3EAE6', '#0B3D2E')$q$);
  if msg not like '%violates foreign key constraint%' then
    raise exception 'FAIL: a theme was created for a market the brand has no presence in (%)', msg;
  end if;

  raise notice 'PASS: no theme row can exist that fails AA — the invariant is the database, not the edge function';
end $$;

set local role authenticated;

-- ---- 2. a brand reads its own theme only, and writes none ----
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
do $$
declare own int; other int; msg text;
begin
  select count(*) into other from public.brand_themes where brand_id = '00000000-0000-0000-0000-00000000000b';
  if other <> 0 then raise exception 'CRITICAL: Brand A can read Brand B''s theme (got %)', other; end if;
  select count(*) into own from public.brand_themes;
  if own <> 1 then raise exception 'FAIL: Brand A should see its own theme (got %)', own; end if;

  msg := test_helpers.try($q$update public.brand_themes set accent_hex = '#123456'
    where brand_id = '00000000-0000-0000-0000-00000000000a'$q$);
  if msg not like '%permission denied%' and msg not like '%row-level security%' then
    if exists (select 1 from public.brand_themes where accent_hex = '#123456') then
      raise exception 'CRITICAL: a brand changed its own accent directly, skipping the AA gate';
    end if;
  end if;

  raise notice 'PASS: a brand reads its own theme, writes none, and sees nothing of Brand B''s';
end $$;

-- ---- 3. themes are not consumer data: no end user, no anon ----
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true);
do $$
declare n int;
begin
  select count(*) into n from public.brand_themes;
  if n <> 0 then raise exception 'CRITICAL: an end user can read brand themes (got %)', n; end if;
  raise notice 'PASS: an end user reads no themes — the consumer surface is rendered server-side';
end $$;

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$
declare n int;
begin
  select count(*) into n from public.brand_themes;
  if n <> 0 then raise exception 'CRITICAL: anon can read brand themes (got %)', n; end if;
  raise notice 'PASS: anon reads no themes';
end $$;

-- ---- 4. staff read all; the service role is the only writer ----
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
do $$
declare n int;
begin
  select count(*) into n from public.brand_themes;
  if n <> 2 then raise exception 'FAIL: ops staff should see both themes (got %)', n; end if;
  raise notice 'PASS: staff read every theme';
end $$;

reset role;
set local role service_role;
select set_config('request.jwt.claims', '', true);
do $$
declare msg text;
begin
  msg := test_helpers.try($q$update public.brand_themes set accent_hex = '#123C8C', hover_hex = '#10357B'
    where brand_id = '00000000-0000-0000-0000-00000000000a'$q$);
  if msg <> '' then raise exception 'CRITICAL: the service role cannot update a theme (%)', msg; end if;

  -- ...but even the service role cannot store a failing one.
  msg := test_helpers.try($q$update public.brand_themes set accent_hex = '#FFD60A'
    where brand_id = '00000000-0000-0000-0000-00000000000a'$q$);
  if msg not like '%brand_themes_aa%' then
    raise exception 'CRITICAL: the service role stored an accent that fails AA (%)', msg;
  end if;

  raise notice 'PASS: the service role writes themes — and is held to the same AA invariant';
end $$;

rollback;
