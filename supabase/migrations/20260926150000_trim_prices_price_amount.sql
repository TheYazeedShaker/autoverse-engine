-- 20260926150000_trim_prices_price_amount.sql
-- PAGE-CONSUMER-SHOWROOM, owner decision (#build-decisions, 2026-09-26, option A).
--
-- `trim_prices.price_egp` named one currency while `brand_markets.currency` is per market, so a
-- non-EGP market would have printed an EGP-named number as its own currency. The column becomes
-- `price_amount`, and its currency is ALWAYS `brand_markets.currency` of the row's market. The
-- existing foreign key (brand_id, market_code) → brand_markets guarantees there is exactly one.
--
-- A rename only: no data moves, and the CHECKs (price_or_request, non_negative) follow the column
-- automatically because Postgres binds them by column number, not by name. Renamed before any
-- consumer code reads the column (the showroom's database-backed source doesn't exist yet).

alter table public.trim_prices rename column price_egp to price_amount;

comment on column public.trim_prices.price_amount is
  'Price in the currency of this row''s market (brand_markets.currency via (brand_id, market_code)). '
  'Null exactly when on_request.';
