-- 0019_trim_prices_price_amount.test.sql
-- Migration 20260926150000_trim_prices_price_amount.sql: price_egp is renamed to price_amount.
-- Proves: the old name is gone, the new one exists, and both price CHECKs still bind to it.
-- Isolation for trim_prices is unchanged and stays covered by 0003 (which now uses price_amount).
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

do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'trim_prices' and column_name = 'price_egp') then
    raise exception 'FAIL: trim_prices.price_egp still exists';
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'trim_prices' and column_name = 'price_amount') then
    raise exception 'FAIL: trim_prices.price_amount is missing';
  end if;
  raise notice 'PASS: the column is price_amount';
end $$;

insert into public.brands (id, slug, name) values
  ('00000000-0000-0000-0000-00000000019a', 'brand-19', 'Brand 19');
insert into public.brand_markets (brand_id, market_code, currency, locale) values
  ('00000000-0000-0000-0000-00000000019a', 'SA', 'SAR', 'ar-SA');
insert into public.models (id, brand_id, slug, name_en, name_ar) values
  ('00000000-0000-0000-0000-0000000191a1', '00000000-0000-0000-0000-00000000019a', 'm', 'M', 'م');
insert into public.trims (id, brand_id, model_id, slug, name_en, name_ar) values
  ('00000000-0000-0000-0000-0000000192a1', '00000000-0000-0000-0000-00000000019a',
   '00000000-0000-0000-0000-0000000191a1', 't', 'T', 'ت');

do $$
declare msg text;
begin
  -- A non-EGP market holds an amount in its own currency now.
  insert into public.trim_prices (brand_id, trim_id, market_code, price_amount)
    values ('00000000-0000-0000-0000-00000000019a', '00000000-0000-0000-0000-0000000192a1', 'SA', 250000);

  msg := test_helpers.try($q$update public.trim_prices set on_request = true
    where trim_id = '00000000-0000-0000-0000-0000000192a1'$q$);
  if msg not like '%trim_prices_price_or_request%' then
    raise exception 'FAIL: a row was both an amount and "on request" (%)', msg;
  end if;

  msg := test_helpers.try($q$update public.trim_prices set price_amount = -1
    where trim_id = '00000000-0000-0000-0000-0000000192a1'$q$);
  if msg not like '%trim_prices_non_negative%' then
    raise exception 'FAIL: a negative price was accepted (%)', msg;
  end if;

  raise notice 'PASS: both price CHECKs still bind to price_amount';
end $$;

rollback;
