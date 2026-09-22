-- 0003_catalog.test.sql
-- MANDATORY isolation test for migration 20260922193336_catalog.sql (1·A Slice 1).
-- Proves: a brand reads only its own catalog rows and can write none of them; a signed-in end user
-- sees published rows in live markets only; staff keep the god-view; and the composite foreign keys
-- make a cross-brand row impossible in the first place.
--
-- Runs in CI on every PR (the `isolation` job). A violation RAISES EXCEPTION = a failing test.
-- Rolls back, so no fixture data persists.

begin;

create schema test_helpers;
grant usage on schema test_helpers to anon, authenticated;
create function test_helpers.try(stmt text) returns text language plpgsql as $$
begin
  execute stmt;
  return '';
exception when others then
  return sqlerrm;
end $$;

-- ===== fixtures (database owner = trusted 'server' context) =====
insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000a1'),  -- Brand A admin
  ('00000000-0000-0000-0000-0000000000b1'),  -- Brand B admin
  ('00000000-0000-0000-0000-0000000000c1'),  -- Autoverse ops
  ('00000000-0000-0000-0000-0000000000d1');  -- end user, no profile

insert into public.brands (id, slug, name) values
  ('00000000-0000-0000-0000-00000000000a', 'brand-a', 'Brand A'),
  ('00000000-0000-0000-0000-00000000000b', 'brand-b', 'Brand B');

insert into public.profiles (id, brand_id, brand_role, platform_role) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', 'brand_admin', null),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000b', 'brand_admin', null),
  ('00000000-0000-0000-0000-0000000000c1', null, null, 'ops');

insert into public.brand_markets (id, brand_id, market_code, currency, locale, rtl, live) values
  ('00000000-0000-0000-0000-0000000a0001', '00000000-0000-0000-0000-00000000000a', 'EG', 'EGP', 'ar-EG', true,  true),
  ('00000000-0000-0000-0000-0000000a0002', '00000000-0000-0000-0000-00000000000a', 'AE', 'AED', 'ar-AE', true,  false),
  ('00000000-0000-0000-0000-0000000b0001', '00000000-0000-0000-0000-00000000000b', 'EG', 'EGP', 'ar-EG', true,  true);

insert into public.models (id, brand_id, slug, name_en, name_ar, publish_state, order_index) values
  ('00000000-0000-0000-0000-0000000a1001', '00000000-0000-0000-0000-00000000000a', 'a-published', 'A Published', 'أ منشور', 'published', 1),
  ('00000000-0000-0000-0000-0000000a1002', '00000000-0000-0000-0000-00000000000a', 'a-draft',     'A Draft',     'أ مسودة', 'draft',     2),
  ('00000000-0000-0000-0000-0000000b1001', '00000000-0000-0000-0000-00000000000b', 'b-published', 'B Published', 'ب منشور', 'published', 1),
  ('00000000-0000-0000-0000-0000000b1002', '00000000-0000-0000-0000-00000000000b', 'b-draft',     'B Draft',     'ب مسودة', 'draft',     2);

insert into public.trims (id, brand_id, model_id, slug, name_en, name_ar, publish_state) values
  ('00000000-0000-0000-0000-0000000a2001', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000a1001', 'base', 'Base', 'أساسي', 'published'),
  ('00000000-0000-0000-0000-0000000b2001', '00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000b1001', 'base', 'Base', 'أساسي', 'published');

insert into public.trim_prices (brand_id, trim_id, market_code, price_egp, on_request) values
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000a2001', 'EG', 1500000.00, false),
  ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000b2001', 'EG', 1600000.00, false);

-- ---- 1. the database refuses a cross-brand row outright ----
do $$
declare msg text;
begin
  msg := test_helpers.try($q$insert into public.trims (brand_id, model_id, slug, name_en, name_ar)
    values ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000a1001', 'stolen', 'X', 'X')$q$);
  if msg not like '%violates foreign key constraint%' then
    raise exception 'CRITICAL: a trim was attached to another brand''s model (%)', msg;
  end if;

  msg := test_helpers.try($q$insert into public.trim_prices (brand_id, trim_id, market_code, price_egp)
    values ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000a2001', 'EG', 1)$q$);
  if msg not like '%violates foreign key constraint%' then
    raise exception 'CRITICAL: a price was attached to another brand''s trim (%)', msg;
  end if;

  -- A price in a market the brand does not operate in.
  msg := test_helpers.try($q$insert into public.trim_prices (brand_id, trim_id, market_code, price_egp)
    values ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000b2001', 'SA', 1)$q$);
  if msg not like '%violates foreign key constraint%' then
    raise exception 'FAIL: a price was set in a market the brand has no presence in (%)', msg;
  end if;

  -- "On request" and a number are mutually exclusive.
  msg := test_helpers.try($q$insert into public.trim_prices (brand_id, trim_id, market_code, price_egp, on_request)
    values ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000b2001', 'EG', 1, true)$q$);
  if msg not like '%trim_prices_price_or_request%' then
    raise exception 'FAIL: a price row was both a number and "on request" (%)', msg;
  end if;

  raise notice 'PASS: composite FKs and price checks make a cross-brand or contradictory row impossible';
end $$;

set local role authenticated;

-- ---- 2. Brand A: sees all of its own, none of Brand B's ----
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
do $$
declare own int; other int;
begin
  select count(*) into own   from public.models where brand_id = '00000000-0000-0000-0000-00000000000a';
  select count(*) into other from public.models where brand_id = '00000000-0000-0000-0000-00000000000b';
  if own <> 2 then raise exception 'FAIL: Brand A should see both its own models incl. the draft (got %)', own; end if;
  if other <> 0 then raise exception 'CRITICAL: Brand A can read Brand B''s models (got %)', other; end if;

  select count(*) into other from public.trims        where brand_id = '00000000-0000-0000-0000-00000000000b';
  if other <> 0 then raise exception 'CRITICAL: Brand A can read Brand B''s trims (got %)', other; end if;
  select count(*) into other from public.trim_prices  where brand_id = '00000000-0000-0000-0000-00000000000b';
  if other <> 0 then raise exception 'CRITICAL: Brand A can read Brand B''s prices (got %)', other; end if;
  select count(*) into other from public.brand_markets where brand_id = '00000000-0000-0000-0000-00000000000b';
  if other <> 0 then raise exception 'CRITICAL: Brand A can read Brand B''s markets (got %)', other; end if;

  raise notice 'PASS: Brand A reads its own catalog only — including its drafts, none of Brand B''s rows';
end $$;

-- ---- 3. Brand A cannot write anything: catalog edits go through edge functions ----
do $$
declare n int; msg text;
begin
  update public.models set name_en = 'hacked' where brand_id = '00000000-0000-0000-0000-00000000000a';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'CRITICAL: a brand user updated its own model directly'; end if;

  update public.models set publish_state = 'published' where id = '00000000-0000-0000-0000-0000000a1002';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'CRITICAL: a brand user published its own draft directly'; end if;

  update public.trim_prices set price_egp = 1 where brand_id = '00000000-0000-0000-0000-00000000000a';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'CRITICAL: a brand user changed its own price directly'; end if;

  delete from public.trims where brand_id = '00000000-0000-0000-0000-00000000000a';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'CRITICAL: a brand user deleted its own trim directly'; end if;

  msg := test_helpers.try($q$insert into public.models (brand_id, slug, name_en, name_ar)
    values ('00000000-0000-0000-0000-00000000000a', 'sneaky', 'S', 'S')$q$);
  if msg not like '%row-level security%' then
    raise exception 'CRITICAL: a brand user created a model directly (%)', msg;
  end if;

  raise notice 'PASS: brand users write no catalog rows at all — service role only';
end $$;

-- ---- 4. A signed-in end user sees published rows in live markets only ----
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true);
do $$
declare n int;
begin
  select count(*) into n from public.models;
  if n <> 2 then raise exception 'FAIL: an end user should see the 2 published models (got %)', n; end if;

  select count(*) into n from public.models where publish_state <> 'published';
  if n <> 0 then raise exception 'CRITICAL: an end user can read unpublished models (got %)', n; end if;

  select count(*) into n from public.brand_markets;
  if n <> 2 then raise exception 'FAIL: an end user should see the 2 live markets, not the dormant one (got %)', n; end if;

  select count(*) into n from public.brand_markets where not live;
  if n <> 0 then raise exception 'CRITICAL: an end user can read a market that is not live (got %)', n; end if;

  select count(*) into n from public.trims;
  if n <> 2 then raise exception 'FAIL: an end user should see both published trims (got %)', n; end if;

  select count(*) into n from public.trim_prices;
  if n <> 2 then raise exception 'FAIL: an end user should see both published prices (got %)', n; end if;

  raise notice 'PASS: an end user reads published rows in live markets, and nothing else';
end $$;

-- ---- 5. anon reads nothing at all ----
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$
declare nm int; nt int; np int; nb int;
begin
  select count(*) into nm from public.models;
  select count(*) into nt from public.trims;
  select count(*) into np from public.trim_prices;
  select count(*) into nb from public.brand_markets;
  if nm <> 0 or nt <> 0 or np <> 0 or nb <> 0 then
    raise exception 'CRITICAL: anon reads catalog rows (models %, trims %, prices %, markets %)', nm, nt, np, nb;
  end if;
  raise notice 'PASS: anon reads no catalog rows (the consumer surface reads server-side)';
end $$;

-- ---- 6. Autoverse staff keep the god-view (read), and still cannot write ----
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
do $$
declare n int;
begin
  select count(*) into n from public.models;
  if n <> 4 then raise exception 'FAIL: ops staff should see all 4 models (got %)', n; end if;
  select count(*) into n from public.trim_prices;
  if n <> 2 then raise exception 'FAIL: ops staff should see both prices (got %)', n; end if;

  update public.models set name_en = 'hacked' where id = '00000000-0000-0000-0000-0000000a1001';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'CRITICAL: staff edited the catalog directly — writes must go via edge functions'; end if;

  raise notice 'PASS: staff read the whole catalog and still write none of it';
end $$;

rollback;
