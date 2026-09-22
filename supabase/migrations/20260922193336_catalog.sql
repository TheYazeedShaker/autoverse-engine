-- 20260922193336_catalog.sql
-- ENGINE-CORE-1A Slice 1 — catalog and markets.
--
-- brand_markets  a brand's presence in one market: currency, locale, direction, consent defaults
-- models         a vehicle line
-- trims          a variant of a model, overriding the model's stats where they differ
-- trim_prices    one price per trim per market ("on request" instead of a number)
--
-- RLS follows the corrected template (20260921151103_rls_hardening.sql): reads only, writes through
-- service-role edge functions. Three read paths per table: Autoverse staff (god-view), the owning
-- brand, and signed-in end users — who see published rows in live markets only.
--
-- brand_id is carried on every table, including the ones that could reach it through a parent, so
-- each policy is a local check. Composite foreign keys keep those copies honest: a trim cannot
-- point at another brand's model.

-- ---------- enums ----------
create type publish_state         as enum ('draft', 'ready', 'published');
create type efficiency_icon_kind  as enum ('pump', 'battery', 'range');

-- ---------- shared helper: keep updated_at honest ----------
create or replace function app_auth.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

revoke execute on function app_auth.set_updated_at() from public, anon, authenticated;

-- ---------- brand_markets ----------
create table public.brand_markets (
  id               uuid primary key default gen_random_uuid(),
  brand_id         uuid not null references public.brands(id) on delete cascade,
  market_code      text not null,                      -- ISO 3166-1 alpha-2, e.g. 'EG'
  currency         text not null,                      -- ISO 4217, e.g. 'EGP'
  locale           text not null,                      -- BCP 47, e.g. 'ar-EG'
  rtl              boolean not null default false,
  consent_defaults jsonb   not null default '{}'::jsonb,
  subdomain        text unique,
  live             boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (brand_id, market_code),
  constraint brand_markets_market_code_format check (market_code ~ '^[A-Z]{2}$'),
  constraint brand_markets_currency_format    check (currency ~ '^[A-Z]{3}$')
);

-- The unique (brand_id, market_code) constraint above is what children reference; it already
-- provides the index, so there is no separate one here.
create index brand_markets_brand_idx on public.brand_markets (brand_id);

-- ---------- models ----------
create table public.models (
  id                    uuid primary key default gen_random_uuid(),
  brand_id              uuid not null references public.brands(id) on delete cascade,
  slug                  text not null,
  name_en               text not null,
  name_ar               text not null,
  year                  integer,
  body_type             text,
  badge_label           text,
  fuel                  text,
  fuel_category         text,
  drive                 text,
  transmission          text,
  seats                 integer,
  accel_0_100_s         numeric(4, 1),
  power_hp              integer,
  top_speed_kph         integer,
  torque_nm             integer,
  efficiency_label_en   text,
  efficiency_label_ar   text,
  efficiency_value      text,
  efficiency_icon_kind  efficiency_icon_kind,
  -- One ordering for the whole line-up: hero adjacency IS section order (REV2).
  order_index           integer not null default 0,
  publish_state         publish_state not null default 'draft',
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (brand_id, slug),
  -- Target for the composite FKs below: a child row's brand must match its model's brand.
  unique (id, brand_id),
  constraint models_seats_positive  check (seats is null or seats > 0),
  constraint models_year_plausible  check (year is null or year between 1900 and 2100),
  -- An efficiency figure is only meaningful with its label and icon.
  constraint models_efficiency_complete check (
    (efficiency_value is null and efficiency_icon_kind is null)
    or (efficiency_value is not null and efficiency_icon_kind is not null
        and efficiency_label_en is not null and efficiency_label_ar is not null)
  )
);

create index models_brand_idx          on public.models (brand_id);
create index models_brand_order_idx    on public.models (brand_id, order_index);
create index models_published_idx      on public.models (brand_id) where publish_state = 'published';

create trigger models_set_updated_at before update on public.models
  for each row execute function app_auth.set_updated_at();

-- ---------- trims ----------
-- Stat columns are overrides: null means "inherit the model's value". Slice 6's repositories
-- resolve them; nothing is copied down, so a model edit still reaches every trim.
create table public.trims (
  id              uuid primary key default gen_random_uuid(),
  brand_id        uuid not null references public.brands(id) on delete cascade,
  model_id        uuid not null,
  slug            text not null,
  name_en         text not null,
  name_ar         text not null,
  drive           text,
  seats           integer,
  accel_0_100_s   numeric(4, 1),
  power_hp        integer,
  top_speed_kph   integer,
  torque_nm       integer,
  order_index     integer not null default 0,
  publish_state   publish_state not null default 'draft',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (model_id, slug),
  unique (id, brand_id),
  constraint trims_seats_positive check (seats is null or seats > 0),
  -- The trim's brand must be its model's brand. Enforced by the database, not by application code.
  foreign key (model_id, brand_id) references public.models (id, brand_id) on delete cascade
);

create index trims_brand_idx       on public.trims (brand_id);
create index trims_model_order_idx on public.trims (model_id, order_index);

create trigger trims_set_updated_at before update on public.trims
  for each row execute function app_auth.set_updated_at();

-- ---------- trim_prices ----------
create table public.trim_prices (
  id           uuid primary key default gen_random_uuid(),
  brand_id     uuid not null references public.brands(id) on delete cascade,
  trim_id      uuid not null,
  market_code  text not null,
  price_egp    numeric(12, 2),
  on_request   boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (trim_id, market_code),
  foreign key (trim_id, brand_id)     references public.trims (id, brand_id) on delete cascade,
  -- The market must be one this brand actually operates in.
  foreign key (brand_id, market_code) references public.brand_markets (brand_id, market_code) on delete cascade,
  -- Exactly one of the two: a number, or "price on request".
  constraint trim_prices_price_or_request check (
    (on_request and price_egp is null) or (not on_request and price_egp is not null)
  ),
  constraint trim_prices_non_negative check (price_egp is null or price_egp >= 0)
);

create index trim_prices_brand_idx  on public.trim_prices (brand_id);
create index trim_prices_market_idx on public.trim_prices (brand_id, market_code);

create trigger trim_prices_set_updated_at before update on public.trim_prices
  for each row execute function app_auth.set_updated_at();

create trigger brand_markets_set_updated_at before update on public.brand_markets
  for each row execute function app_auth.set_updated_at();

-- ============================================================================================
-- RLS — reads only. Every write goes through a service-role edge function.
-- ============================================================================================
alter table public.brand_markets enable row level security;
alter table public.models        enable row level security;
alter table public.trims         enable row level security;
alter table public.trim_prices   enable row level security;

-- Staff god-view (read).
create policy brand_markets_staff_read on public.brand_markets
  for select using (app_auth.is_autoverse_staff());
create policy models_staff_read on public.models
  for select using (app_auth.is_autoverse_staff());
create policy trims_staff_read on public.trims
  for select using (app_auth.is_autoverse_staff());
create policy trim_prices_staff_read on public.trim_prices
  for select using (app_auth.is_autoverse_staff());

-- The owning brand sees everything of its own, published or not.
create policy brand_markets_brand_read on public.brand_markets
  for select using (brand_id = app_auth.current_brand_id());
create policy models_brand_read on public.models
  for select using (brand_id = app_auth.current_brand_id());
create policy trims_brand_read on public.trims
  for select using (brand_id = app_auth.current_brand_id());
create policy trim_prices_brand_read on public.trim_prices
  for select using (brand_id = app_auth.current_brand_id());

-- Signed-in end users: published rows in live markets only. A draft model, or a published model in
-- a market that has not gone live, is invisible.
--
-- The spec asks for both "authenticated reads on published rows" and "brand users read own brand
-- only". Brand staff are authenticated, so those two only hold together if the published-read path
-- excludes them — hence `current_brand_id() is null`. A brand user therefore sees exactly its own
-- brand and nothing of a competitor's, published or not. Flagged to Yazeed: if brand staff should
-- also browse other brands' published catalogue, drop that clause.
create policy brand_markets_public_read on public.brand_markets
  for select to authenticated using (live and app_auth.current_brand_id() is null);

create policy models_public_read on public.models
  for select to authenticated using (
    publish_state = 'published' and app_auth.current_brand_id() is null
  );

create policy trims_public_read on public.trims
  for select to authenticated using (
    app_auth.current_brand_id() is null
    and publish_state = 'published'
    and exists (
      select 1 from public.models m
      where m.id = trims.model_id and m.publish_state = 'published'
    )
  );

create policy trim_prices_public_read on public.trim_prices
  for select to authenticated using (
    app_auth.current_brand_id() is null
    and exists (
      select 1
      from public.trims t
      join public.models m on m.id = t.model_id
      join public.brand_markets bm
        on bm.brand_id = trim_prices.brand_id and bm.market_code = trim_prices.market_code
      where t.id = trim_prices.trim_id
        and t.publish_state = 'published'
        and m.publish_state = 'published'
        and bm.live
    )
  );

-- No insert/update/delete policies anywhere above: deny-by-default covers writes, and the service
-- role (edge functions) bypasses RLS. See the pattern at the bottom of the hardening migration.
