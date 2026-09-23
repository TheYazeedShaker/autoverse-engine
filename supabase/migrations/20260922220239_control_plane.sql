-- 20260922220239_control_plane.sql
-- ENGINE-CORE-1A Slice 3 — control plane and billing.
--
-- tier_modules          which dashboard modules each tier includes — the matrix the dashboard gates on
-- subscriptions         what a brand is on: tier, term, renewal, free period
-- invoices              what a brand owes and whether it paid
-- brand_markets +cols   presentation config a visitor may see (footer, socials, WhatsApp)
-- brand_market_private  routing config a visitor may NOT see (lead emails, webhook URL)
--
-- REV2 asks for lead-routing emails and a webhook URL in "brand market config". They do NOT go in
-- brand_markets: that table is readable by every signed-in end user (slice 1), so a webhook URL
-- there is an open door and the emails are third-party PII. They live in brand_market_private,
-- which only the owning brand and Autoverse staff can read, and only the service role can write.

-- ---------- enums ----------
create type invoice_status as enum ('draft', 'sent', 'paid', 'overdue');

-- ============================================================================================
-- tier_modules — the tier ↔ module matrix
-- ============================================================================================
-- Platform configuration, not tenant data: the same matrix applies to every brand, and a brand's
-- dashboard needs it to know which modules its tier includes.
create table public.tier_modules (
  tier_key    tier_level not null,
  module_key  text       not null,
  included    boolean    not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (tier_key, module_key),
  constraint tier_modules_module_key_format check (module_key ~ '^[a-z0-9][a-z0-9_-]{0,62}$')
);

create trigger tier_modules_set_updated_at before update on public.tier_modules
  for each row execute function app_auth.set_updated_at();

-- ============================================================================================
-- subscriptions — what a brand is on
-- ============================================================================================
create table public.subscriptions (
  id                   uuid primary key default gen_random_uuid(),
  brand_id             uuid not null references public.brands(id) on delete cascade,
  tier_key             tier_level not null,
  term_months          integer not null default 12,
  started_at           timestamptz not null default now(),
  renews_at            timestamptz,
  ends_at              timestamptz,
  status               billing_state not null default 'pending_activation',
  free_period_days     integer not null default 0,
  free_period_ends_at  timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint subscriptions_term_positive      check (term_months > 0),
  constraint subscriptions_free_days_positive check (free_period_days >= 0),
  constraint subscriptions_ends_after_start   check (ends_at is null or ends_at > started_at),
  constraint subscriptions_renews_after_start check (renews_at is null or renews_at > started_at)
);

-- One live subscription per brand; history is kept by the ended ones.
create unique index subscriptions_one_live_per_brand
  on public.subscriptions (brand_id)
  where status in ('active', 'pending_activation', 'past_due');

create index subscriptions_brand_idx on public.subscriptions (brand_id);

create trigger subscriptions_set_updated_at before update on public.subscriptions
  for each row execute function app_auth.set_updated_at();

-- ============================================================================================
-- invoices
-- ============================================================================================
create table public.invoices (
  id              uuid primary key default gen_random_uuid(),
  brand_id        uuid not null references public.brands(id) on delete cascade,
  number          text not null,
  amount_minor    bigint not null,           -- minor units (piastres, fils) — never a float
  currency        text not null,
  status          invoice_status not null default 'draft',
  issued_at       timestamptz,
  due_at          timestamptz,
  paid_at         timestamptz,
  pdf_asset_ref   text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (brand_id, number),
  constraint invoices_amount_non_negative check (amount_minor >= 0),
  constraint invoices_currency_format     check (currency ~ '^[A-Z]{3}$'),
  constraint invoices_due_after_issue     check (due_at is null or issued_at is null or due_at >= issued_at),
  -- A sent invoice has a date; a paid one has both a date and a payment.
  constraint invoices_issued_when_sent    check (status = 'draft' or issued_at is not null),
  constraint invoices_paid_has_paid_at    check (status <> 'paid' or paid_at is not null)
);

create index invoices_brand_idx  on public.invoices (brand_id, status);

create trigger invoices_set_updated_at before update on public.invoices
  for each row execute function app_auth.set_updated_at();

-- ============================================================================================
-- brand_markets — presentation config (REV2). Safe for a visitor to read.
-- ============================================================================================
alter table public.brand_markets
  add column whatsapp_number      text,
  add column footer_description_en text,
  add column footer_description_ar text,
  -- [{ "title_en": …, "title_ar": …, "links": [{ "label_en": …, "href": … }] }]
  add column footer_link_columns  jsonb not null default '[]'::jsonb,
  -- [{ "platform": "instagram", "href": … }] — ordered as authored.
  add column social_links         jsonb not null default '[]'::jsonb,
  add constraint brand_markets_footer_columns_is_array check (jsonb_typeof(footer_link_columns) = 'array'),
  add constraint brand_markets_social_links_is_array   check (jsonb_typeof(social_links) = 'array'),
  -- E.164, the only format a wa.me link accepts.
  add constraint brand_markets_whatsapp_e164 check (whatsapp_number is null or whatsapp_number ~ '^\+[1-9][0-9]{6,14}$');

-- ============================================================================================
-- brand_market_private — routing config. NOT visitor-readable.
-- ============================================================================================
-- A CHECK constraint cannot contain a subquery, so the per-element email test lives in a function.
-- Immutable, so a constraint may call it.
create or replace function app_auth.all_emails_valid(emails text[])
returns boolean language sql immutable set search_path = '' as $fn$
  select coalesce(bool_and(e ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'), true)
  from unnest(coalesce(emails, '{}'::text[])) as e
$fn$;

create table public.brand_market_private (
  brand_id                  uuid not null,
  market_code               text not null,
  lead_routing_emails       text[] not null default '{}',
  lead_routing_webhook_url  text,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  primary key (brand_id, market_code),
  foreign key (brand_id, market_code)
    references public.brand_markets (brand_id, market_code) on delete cascade,
  -- Deliveries leave our network, so the endpoint must be https. No plaintext webhooks.
  constraint brand_market_private_webhook_https
    check (lead_routing_webhook_url is null or lead_routing_webhook_url ~ '^https://'),
  constraint brand_market_private_emails_look_like_emails
    check (app_auth.all_emails_valid(lead_routing_emails))
);

create trigger brand_market_private_set_updated_at before update on public.brand_market_private
  for each row execute function app_auth.set_updated_at();

-- ============================================================================================
-- RLS
-- ============================================================================================
alter table public.tier_modules         enable row level security;
alter table public.subscriptions        enable row level security;
alter table public.invoices             enable row level security;
alter table public.brand_market_private enable row level security;

-- The tier matrix is platform config with no tenant content: any signed-in user may read it, which
-- is what lets a dashboard say "this module needs tier 2" without leaking anyone's data.
create policy tier_modules_read on public.tier_modules
  for select to authenticated using (true);

-- Commercial rows: the owning brand and Autoverse staff. No public read path at all — these never
-- appear on a consumer surface.
create policy subscriptions_staff_read on public.subscriptions
  for select using ((select app_auth.is_autoverse_staff()));
create policy subscriptions_brand_read on public.subscriptions
  for select using (brand_id = (select app_auth.current_brand_id()));

create policy invoices_staff_read on public.invoices
  for select using ((select app_auth.is_autoverse_staff()));
create policy invoices_brand_read on public.invoices
  for select using (brand_id = (select app_auth.current_brand_id()));

create policy brand_market_private_staff_read on public.brand_market_private
  for select using ((select app_auth.is_autoverse_staff()));
create policy brand_market_private_brand_read on public.brand_market_private
  for select using (brand_id = (select app_auth.current_brand_id()));

-- Writes: service role only, at both layers.
revoke insert, update, delete on public.tier_modules         from anon, authenticated;
revoke insert, update, delete on public.subscriptions        from anon, authenticated;
revoke insert, update, delete on public.invoices             from anon, authenticated;
revoke insert, update, delete on public.brand_market_private from anon, authenticated;
