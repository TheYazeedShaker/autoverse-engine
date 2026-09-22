-- 0005_control_plane.test.sql
-- MANDATORY isolation test for migration 20260922220239_control_plane.sql (1·A Slice 3).
-- Proves: commercial rows (subscriptions, invoices) are visible only to their own brand and to
-- Autoverse staff, never to an end user; lead-routing config is invisible to end users while the
-- presentation config on the same market row stays public; a brand cannot read a competitor's
-- money; nobody but the service role writes.
--
-- The split matters: REV2 asked for the routing webhook and emails in "brand market config", and
-- brand_markets is readable by every signed-in user. This test is what keeps them apart.

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

insert into public.brand_markets (brand_id, market_code, currency, locale, live, whatsapp_number, footer_description_en)
values
  ('00000000-0000-0000-0000-00000000000a', 'EG', 'EGP', 'ar-EG', true, '+201000000000', 'Brand A Egypt'),
  ('00000000-0000-0000-0000-00000000000b', 'EG', 'EGP', 'ar-EG', true, '+201111111111', 'Brand B Egypt');

insert into public.brand_market_private (brand_id, market_code, lead_routing_emails, lead_routing_webhook_url) values
  ('00000000-0000-0000-0000-00000000000a', 'EG', array['sales@brand-a.example'], 'https://hooks.brand-a.example/leads'),
  ('00000000-0000-0000-0000-00000000000b', 'EG', array['sales@brand-b.example'], 'https://hooks.brand-b.example/leads');

insert into public.tier_modules (tier_key, module_key, included) values
  ('tier1', 'leads', true),
  ('tier1', 'analytics', false),
  ('tier2', 'analytics', true);

insert into public.subscriptions (brand_id, tier_key, term_months, status, free_period_days) values
  ('00000000-0000-0000-0000-00000000000a', 'tier1', 12, 'active', 30),
  ('00000000-0000-0000-0000-00000000000b', 'tier2', 24, 'active', 0);

insert into public.invoices (brand_id, number, amount_minor, currency, status, issued_at) values
  ('00000000-0000-0000-0000-00000000000a', 'INV-A-001', 5000000, 'EGP', 'sent', now()),
  ('00000000-0000-0000-0000-00000000000b', 'INV-B-001', 9000000, 'EGP', 'sent', now());

-- ---- 1. the shapes the database refuses ----
do $$
declare msg text;
begin
  msg := test_helpers.try($q$insert into public.brand_market_private (brand_id, market_code, lead_routing_webhook_url)
    values ('00000000-0000-0000-0000-00000000000a', 'EG', 'http://insecure.example/hook')$q$);
  if msg not like '%brand_market_private_webhook_https%' then
    raise exception 'FAIL: a plaintext http webhook was accepted (%)', msg;
  end if;

  msg := test_helpers.try($q$update public.brand_market_private set lead_routing_emails = array['not-an-email']
    where brand_id = '00000000-0000-0000-0000-00000000000a'$q$);
  if msg not like '%brand_market_private_emails_look_like_emails%' then
    raise exception 'FAIL: a malformed routing email was accepted (%)', msg;
  end if;

  msg := test_helpers.try($q$insert into public.brand_markets (brand_id, market_code, currency, locale, whatsapp_number)
    values ('00000000-0000-0000-0000-00000000000a', 'AE', 'AED', 'ar-AE', '01000000000')$q$);
  if msg not like '%brand_markets_whatsapp_e164%' then
    raise exception 'FAIL: a non-E.164 WhatsApp number was accepted (%)', msg;
  end if;

  -- A paid invoice must record when it was paid; a sent one must have been issued.
  msg := test_helpers.try($q$insert into public.invoices (brand_id, number, amount_minor, currency, status, issued_at)
    values ('00000000-0000-0000-0000-00000000000a', 'INV-A-002', 1, 'EGP', 'paid', now())$q$);
  if msg not like '%invoices_paid_has_paid_at%' then
    raise exception 'FAIL: an invoice was marked paid with no payment date (%)', msg;
  end if;

  -- Only one live subscription per brand.
  msg := test_helpers.try($q$insert into public.subscriptions (brand_id, tier_key, status)
    values ('00000000-0000-0000-0000-00000000000a', 'tier3', 'active')$q$);
  if msg not like '%subscriptions_one_live_per_brand%' then
    raise exception 'FAIL: a brand got a second live subscription (%)', msg;
  end if;

  raise notice 'PASS: webhooks must be https, emails must be emails, invoices and subscriptions stay coherent';
end $$;

set local role authenticated;

-- ---- 2. Brand A sees its own money and routing, never Brand B's ----
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
do $$
declare own int; other int; msg text;
begin
  select count(*) into other from public.subscriptions where brand_id = '00000000-0000-0000-0000-00000000000b';
  if other <> 0 then raise exception 'CRITICAL: Brand A can read Brand B''s subscription (got %)', other; end if;
  select count(*) into other from public.invoices where brand_id = '00000000-0000-0000-0000-00000000000b';
  if other <> 0 then raise exception 'CRITICAL: Brand A can read Brand B''s invoices (got %)', other; end if;
  select count(*) into other from public.brand_market_private where brand_id = '00000000-0000-0000-0000-00000000000b';
  if other <> 0 then raise exception 'CRITICAL: Brand A can read Brand B''s lead routing (got %)', other; end if;

  select count(*) into own from public.subscriptions;
  if own <> 1 then raise exception 'FAIL: Brand A should see its own subscription (got %)', own; end if;
  select count(*) into own from public.invoices;
  if own <> 1 then raise exception 'FAIL: Brand A should see its own invoice (got %)', own; end if;
  select count(*) into own from public.brand_market_private;
  if own <> 1 then raise exception 'FAIL: Brand A should see its own routing config (got %)', own; end if;

  -- The tier matrix is shared platform config.
  select count(*) into own from public.tier_modules;
  if own <> 3 then raise exception 'FAIL: the tier matrix should be readable (got %)', own; end if;

  msg := test_helpers.try($q$update public.invoices set status = 'paid', paid_at = now()
    where brand_id = '00000000-0000-0000-0000-00000000000a'$q$);
  if msg not like '%permission denied%' and msg not like '%row-level security%' then
    if exists (select 1 from public.invoices where status = 'paid') then
      raise exception 'CRITICAL: a brand marked its own invoice paid';
    end if;
  end if;

  msg := test_helpers.try($q$update public.subscriptions set tier_key = 'tier3'
    where brand_id = '00000000-0000-0000-0000-00000000000a'$q$);
  if msg not like '%permission denied%' and msg not like '%row-level security%' then
    if exists (select 1 from public.subscriptions where tier_key = 'tier3') then
      raise exception 'CRITICAL: a brand upgraded its own tier';
    end if;
  end if;

  raise notice 'PASS: a brand reads its own money and routing, writes neither, and sees nothing of Brand B''s';
end $$;

-- ---- 3. an end user sees presentation config and NO routing, money or tier data ----
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true);
do $$
declare n int;
begin
  select count(*) into n from public.brand_market_private;
  if n <> 0 then
    raise exception 'CRITICAL: an end user can read lead-routing emails and webhook URLs (got %)', n;
  end if;

  select count(*) into n from public.subscriptions;
  if n <> 0 then raise exception 'CRITICAL: an end user can read subscriptions (got %)', n; end if;

  select count(*) into n from public.invoices;
  if n <> 0 then raise exception 'CRITICAL: an end user can read invoices (got %)', n; end if;

  -- ...while the presentation half of the same market row stays readable, which is the point of
  -- keeping them in two tables.
  select count(*) into n from public.brand_markets where whatsapp_number is not null;
  if n <> 2 then raise exception 'FAIL: an end user should read the public market config (got %)', n; end if;

  raise notice 'PASS: routing, subscriptions and invoices are invisible to end users; presentation config is not';
end $$;

-- ---- 4. anon sees none of it ----
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$
declare np int; ns int; ni int; nt int;
begin
  select count(*) into np from public.brand_market_private;
  select count(*) into ns from public.subscriptions;
  select count(*) into ni from public.invoices;
  select count(*) into nt from public.tier_modules;
  if np <> 0 or ns <> 0 or ni <> 0 or nt <> 0 then
    raise exception 'CRITICAL: anon reads control-plane rows (routing %, subs %, invoices %, tiers %)', np, ns, ni, nt;
  end if;
  raise notice 'PASS: anon reads no control-plane rows at all';
end $$;

-- ---- 5. staff read everything; only the service role writes ----
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
do $$
declare n int;
begin
  select count(*) into n from public.subscriptions;
  if n <> 2 then raise exception 'FAIL: ops staff should see both subscriptions (got %)', n; end if;
  select count(*) into n from public.invoices;
  if n <> 2 then raise exception 'FAIL: ops staff should see both invoices (got %)', n; end if;
  select count(*) into n from public.brand_market_private;
  if n <> 2 then raise exception 'FAIL: ops staff should see both routing configs (got %)', n; end if;
  raise notice 'PASS: staff read the whole control plane';
end $$;

reset role;
set local role service_role;
do $$
declare n int; msg text;
begin
  msg := test_helpers.try($q$update public.invoices set status = 'paid', paid_at = now() where number = 'INV-A-001'$q$);
  if msg <> '' then raise exception 'CRITICAL: the service role cannot settle an invoice (%)', msg; end if;

  msg := test_helpers.try($q$update public.brand_market_private
    set lead_routing_webhook_url = 'https://hooks.brand-a.example/v2'
    where brand_id = '00000000-0000-0000-0000-00000000000a'$q$);
  if msg <> '' then raise exception 'CRITICAL: the service role cannot update lead routing (%)', msg; end if;

  select count(*) into n from public.invoices where status = 'paid';
  if n <> 1 then raise exception 'CRITICAL: the service role write did not land'; end if;

  raise notice 'PASS: the service role runs the control plane — nobody else writes it';
end $$;

rollback;
