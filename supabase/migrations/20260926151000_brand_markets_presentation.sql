-- 20260926151000_brand_markets_presentation.sql
-- PAGE-CONSUMER-SHOWROOM, owner decision (#build-decisions, 2026-09-26, revised option A).
--
-- The approved showroom page shows brand-market fields the schema lacked. They join the existing
-- footer fields on brand_markets (control-plane migration), which is PUBLIC presentation config:
-- every one of these is meant to be shown to visitors, and nothing private belongs here.
--
--   footer_tagline_en/ar  the footer's headline
--   hotline               a phone number or a short code, as dialled
--   contact_email         the public contact address
--   cities_en/ar          the footer's "where we are" line
--   lead_cities           the lead form's city select: [{ "id": "cairo", "en": "Cairo", "ar": "…" }]
--                         `id` is what a lead records; en/ar are what the select shows.
--
-- Not added: a hero backdrop. The owner ruled it brand-invariant (an Autoverse asset, like the
-- card, wedge and surfaces), so it is not per-brand data.
--
-- Shapes are checked here as well as by Zod at the boundary, so a bad admin write is refused by the
-- database rather than breaking a live page. RLS is unchanged: the existing brand_markets policies
-- cover the new columns, and writes still go through service-role functions only.

-- The lead city list: an array of at most 100 objects, each with a slug id and non-empty en/ar
-- (at most 80 characters), ids unique. Immutable, so a CHECK may call it (a CHECK can't hold a
-- subquery).
create or replace function app_auth.lead_cities_valid(cities jsonb)
returns boolean language sql immutable set search_path = '' as $fn$
  select case
    when cities is null or jsonb_typeof(cities) <> 'array' then false
    when jsonb_array_length(cities) > 100 then false
    else (
      select coalesce(bool_and(
               jsonb_typeof(c) = 'object'
           and jsonb_typeof(c -> 'id') = 'string'
           and (c ->> 'id') ~ '^[a-z0-9][a-z0-9-]{0,62}$'
           and jsonb_typeof(c -> 'en') = 'string' and length(btrim(c ->> 'en')) between 1 and 80
           and jsonb_typeof(c -> 'ar') = 'string' and length(btrim(c ->> 'ar')) between 1 and 80
         ), true)
         and count(distinct c ->> 'id') = count(*)
      from jsonb_array_elements(cities) as c
    )
  end
$fn$;

-- EXECUTE stays at the default, like all_emails_valid and all_origins_valid: a CHECK runs its
-- function as the writing role, and a pure validator reveals nothing. app_auth isn't exposed by
-- the API, so it can't be called over REST either.

alter table public.brand_markets
  add column footer_tagline_en text,
  add column footer_tagline_ar text,
  add column hotline           text,
  add column contact_email     text,
  add column cities_en         text,
  add column cities_ar         text,
  add column lead_cities       jsonb not null default '[]'::jsonb,
  -- Bilingual pairs: a page never shows one language's copy with the other's missing.
  add constraint brand_markets_footer_tagline_bilingual
    check ((footer_tagline_en is null) = (footer_tagline_ar is null)),
  add constraint brand_markets_cities_bilingual
    check ((cities_en is null) = (cities_ar is null)),
  add constraint brand_markets_presentation_lengths check (
        coalesce(length(footer_tagline_en), 0) <= 160 and coalesce(length(footer_tagline_ar), 0) <= 160
    and coalesce(length(cities_en), 0) <= 200 and coalesce(length(cities_ar), 0) <= 200),
  -- Digits with an optional leading +, inner spaces or dashes; 3–20 characters (short codes too).
  add constraint brand_markets_hotline_format
    check (hotline is null or hotline ~ '^\+?[0-9][0-9 -]{1,18}[0-9]$'),
  add constraint brand_markets_contact_email_format check (
    contact_email is null
    or (length(contact_email) <= 254 and contact_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')),
  add constraint brand_markets_lead_cities_valid check (app_auth.lead_cities_valid(lead_cities));
