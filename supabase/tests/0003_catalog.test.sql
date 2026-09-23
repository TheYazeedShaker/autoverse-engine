-- 0003_catalog.test.sql
-- MANDATORY isolation test for migration 20260922193336_catalog.sql (1·A Slice 1).
-- Proves: a brand reads only its own catalog rows and can write none of them; a signed-in end user
-- sees published rows only (never a published trim whose model is still a draft, never a price in a
-- market that is not live); anon sees nothing; staff keep the god-view but still cannot write; the
-- service role — the only write path — still can; and the composite foreign keys make a cross-brand
-- row impossible in the first place.
--
-- Runs in CI on every PR (the `isolation` job). A violation RAISES EXCEPTION = a failing test.
-- Rolls back, so no fixture data persists.

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
  -- No price rows: lets the cross-brand price test hit the composite FK instead of the
  -- (trim, market) unique, which fired first and passed for the wrong reason.
  ('00000000-0000-0000-0000-0000000a2002', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000a1001', 'sport', 'Sport', 'رياضي', 'published'),
  -- PUBLISHED trim under a DRAFT model: publishing a trim must never leak an unannounced model.
  ('00000000-0000-0000-0000-0000000a2003', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000a1002', 'preview', 'Preview', 'معاينة', 'published'),
  ('00000000-0000-0000-0000-0000000b2001', '00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000b1001', 'base', 'Base', 'أساسي', 'published');

insert into public.trim_prices (brand_id, trim_id, market_code, price_egp, on_request) values
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000a2001', 'EG', 1500000.00, false),
  -- Same trim, in Brand A's DORMANT market: must stay invisible to end users.
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000a2001', 'AE', 95000.00, false),
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
    values ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000a2002', 'EG', 1)$q$);
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

  select count(*) into own   from public.trims;
  select count(*) into other from public.trims where brand_id = '00000000-0000-0000-0000-00000000000b';
  if own <> 3 then raise exception 'FAIL: Brand A should see its own 3 trims (got %)', own; end if;
  if other <> 0 then raise exception 'CRITICAL: Brand A can read Brand B''s trims (got %)', other; end if;

  select count(*) into own   from public.trim_prices;
  select count(*) into other from public.trim_prices where brand_id = '00000000-0000-0000-0000-00000000000b';
  if own <> 2 then raise exception 'FAIL: Brand A should see its own 2 prices, dormant market included (got %)', own; end if;
  if other <> 0 then raise exception 'CRITICAL: Brand A can read Brand B''s prices (got %)', other; end if;

  select count(*) into own   from public.brand_markets;
  select count(*) into other from public.brand_markets where brand_id = '00000000-0000-0000-0000-00000000000b';
  if own <> 2 then raise exception 'FAIL: Brand A should see both its own markets, live or not (got %)', own; end if;
  if other <> 0 then raise exception 'CRITICAL: Brand A can read Brand B''s markets (got %)', other; end if;

  raise notice 'PASS: Brand A reads its own catalog only — including its drafts, none of Brand B''s rows';
end $$;

-- ---- 3. Brand A cannot write anything: catalog edits go through edge functions ----
-- A write is denied twice over: the privilege is revoked AND no write policy exists. Which one
-- fires first depends on the statement, so "denied" means a permission error, an RLS error, or
-- zero rows touched — never a successful write.
do $$
declare msg text;
  denials text[] := array[
    $q$update public.models set name_en = 'hacked' where brand_id = '00000000-0000-0000-0000-00000000000a'$q$,
    $q$update public.models set publish_state = 'published' where id = '00000000-0000-0000-0000-0000000a1002'$q$,
    $q$update public.trim_prices set price_egp = 1 where brand_id = '00000000-0000-0000-0000-00000000000a'$q$,
    $q$delete from public.trims where brand_id = '00000000-0000-0000-0000-00000000000a'$q$,
    $q$insert into public.models (brand_id, slug, name_en, name_ar) values ('00000000-0000-0000-0000-00000000000a', 'sneaky', 'S', 'S')$q$,
    $q$insert into public.brand_markets (brand_id, market_code, currency, locale) values ('00000000-0000-0000-0000-00000000000a', 'SA', 'SAR', 'ar-SA')$q$
  ];
  stmt text;
begin
  foreach stmt in array denials loop
    msg := test_helpers.try(stmt);
    if msg not like '%permission denied%' and msg not like '%row-level security%' then
      raise exception 'CRITICAL: a brand user wrote the catalog directly [%] (%)', stmt, coalesce(nullif(msg, ''), 'no error raised');
    end if;
  end loop;

  -- The draft really is still a draft.
  if exists (select 1 from public.models
             where id = '00000000-0000-0000-0000-0000000a1002' and publish_state <> 'draft') then
    raise exception 'CRITICAL: a brand user published its own draft';
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

  -- Published trims under published models: a2001, a2002, b2001 — NOT a2003, whose model is a draft.
  select count(*) into n from public.trims;
  if n <> 3 then raise exception 'FAIL: an end user should see the 3 publishable trims (got %)', n; end if;

  select count(*) into n from public.trims where id = '00000000-0000-0000-0000-0000000a2003';
  if n <> 0 then raise exception 'CRITICAL: a published trim leaked an unannounced (draft) model'; end if;

  select count(*) into n from public.trim_prices;
  if n <> 2 then raise exception 'FAIL: an end user should see the 2 live-market prices (got %)', n; end if;

  select count(*) into n from public.trim_prices where market_code = 'AE';
  if n <> 0 then raise exception 'CRITICAL: a price leaked from a market that is not live'; end if;

  raise notice 'PASS: an end user reads published rows only — no draft-parent trims, no dormant-market prices';
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
declare n int; msg text;
begin
  select count(*) into n from public.models;
  if n <> 4 then raise exception 'FAIL: ops staff should see all 4 models (got %)', n; end if;
  select count(*) into n from public.trims;
  if n <> 4 then raise exception 'FAIL: ops staff should see all 4 trims (got %)', n; end if;
  select count(*) into n from public.trim_prices;
  if n <> 3 then raise exception 'FAIL: ops staff should see all 3 prices (got %)', n; end if;

  msg := test_helpers.try($q$update public.models set name_en = 'hacked'
    where id = '00000000-0000-0000-0000-0000000a1001'$q$);
  if msg not like '%permission denied%' and msg not like '%row-level security%' then
    if exists (select 1 from public.models
               where id = '00000000-0000-0000-0000-0000000a1001' and name_en = 'hacked') then
      raise exception 'CRITICAL: staff edited the catalog directly — writes must go via edge functions';
    end if;
  end if;

  raise notice 'PASS: staff read the whole catalog and still write none of it';
end $$;

-- ---- 7. the service role (edge functions) can still write — the only write path there is ----
reset role;
set local role service_role;
do $$
declare n int; msg text;
begin
  msg := test_helpers.try($q$insert into public.models (id, brand_id, slug, name_en, name_ar)
    values ('00000000-0000-0000-0000-0000000a1003', '00000000-0000-0000-0000-00000000000a', 'via-edge-fn', 'Via Edge Fn', 'عبر الدالة')$q$);
  if msg <> '' then raise exception 'CRITICAL: the service role cannot create a model — the only write path is broken (%)', msg; end if;

  update public.models set publish_state = 'published' where id = '00000000-0000-0000-0000-0000000a1003';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'CRITICAL: the service role cannot publish a model'; end if;

  delete from public.models where id = '00000000-0000-0000-0000-0000000a1003';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'CRITICAL: the service role cannot delete a model'; end if;

  raise notice 'PASS: the service role writes the catalog — brand users and staff do not';
end $$;

rollback;
