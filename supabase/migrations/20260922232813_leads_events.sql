-- 20260922232813_leads_events.sql
-- ENGINE-CORE-1A Slice 5 — leads and events.
--
-- leads            a person who asked to be contacted. The only table in the engine holding PII.
-- lead_activities  what happened to a lead, append-only: the audit trail
-- events           raw behavioural events, write-once
-- event_dlq        an event that could not be stored. Any row here is an incident.
-- lead_dlq         a lead that could not be stored. Any row here is a paging incident.
--
-- Two rules the database enforces rather than trusting the pipelines:
--   * Consent is not optional. A lead cannot exist without the version of the consent text the
--     person agreed to and the moment they agreed — so "was there consent?" is answerable from the
--     row itself, years later, without reading application code.
--   * History is not editable. Events are write-once and activities are append-only, so an
--     aggregate can always be rebuilt from raw rows and an audit trail cannot be tidied up.
--
-- No consumer-facing read path exists anywhere in this file. Leads and events are written by
-- service-role edge functions and read by the brand that owns them and by Autoverse staff.

-- ---------- enums ----------
create type lead_type     as enum ('test_drive', 'quote', 'contact', 'whatsapp');
create type lead_status   as enum ('new', 'contacted', 'qualified', 'won', 'lost');
create type activity_kind as enum ('status_change', 'contact_attempt', 'note', 'score_update');

-- ============================================================================================
-- leads
-- ============================================================================================
create table public.leads (
  id                    uuid primary key default gen_random_uuid(),
  brand_id              uuid not null references public.brands(id) on delete cascade,
  market_code           text not null,
  -- The consumer form (REV2).
  full_name             text not null,
  phone                 text not null,
  city                  text,
  model_id              uuid,
  trim_id               uuid,
  preferred_time        text,
  type                  lead_type not null default 'contact',
  status                lead_status not null default 'new',
  score                 integer,
  score_breakdown       jsonb,
  -- Consent, captured at the moment of submission and never inferred afterwards.
  consent_text_version  text not null,
  consent_at            timestamptz not null,
  session_id            uuid,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  foreign key (brand_id, market_code) references public.brand_markets (brand_id, market_code),
  foreign key (model_id, brand_id)    references public.models (id, brand_id) on delete set null,
  foreign key (trim_id, brand_id)     references public.trims  (id, brand_id) on delete set null,
  constraint leads_score_range check (score is null or score between 0 and 100),
  constraint leads_score_breakdown_object check (
    score_breakdown is null or jsonb_typeof(score_breakdown) = 'object'
  ),
  constraint leads_full_name_present check (length(btrim(full_name)) > 0),
  constraint leads_phone_present     check (length(btrim(phone)) > 0)
);

create index leads_brand_idx   on public.leads (brand_id, created_at desc);
create index leads_status_idx  on public.leads (brand_id, status);
create index leads_session_idx on public.leads (session_id);

create trigger leads_set_updated_at before update on public.leads
  for each row execute function app_auth.set_updated_at();

-- ============================================================================================
-- lead_activities — append-only
-- ============================================================================================
create table public.lead_activities (
  id          uuid primary key default gen_random_uuid(),
  brand_id    uuid not null references public.brands(id) on delete cascade,
  lead_id     uuid not null references public.leads(id) on delete cascade,
  -- Who did it. Null means the engine itself (scoring, routing), not "unknown".
  actor_id    uuid references auth.users(id) on delete set null,
  kind        activity_kind not null,
  payload     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  constraint lead_activities_payload_object check (jsonb_typeof(payload) = 'object')
);

create index lead_activities_lead_idx on public.lead_activities (lead_id, created_at);

-- An audit trail that can be edited is not an audit trail. Nobody rewrites or removes one — not a
-- brand, not staff, not the service role.
create or replace function app_auth.forbid_mutation()
returns trigger language plpgsql set search_path = '' as $fn$
begin
  raise exception '% is append-only: rows cannot be % once written', tg_table_name, lower(tg_op);
end $fn$;

create trigger lead_activities_append_only
  before update or delete on public.lead_activities
  for each row execute function app_auth.forbid_mutation();

-- ============================================================================================
-- events — write-once
-- ============================================================================================
-- `id` is supplied by the caller and is the idempotency key: at-least-once delivery means the same
-- event will arrive twice, and the second one must be a no-op rather than a duplicate row.
create table public.events (
  id            uuid primary key,
  session_id    uuid,
  brand_id      uuid not null references public.brands(id) on delete cascade,
  market_code   text,
  model_id      uuid,
  trim_id       uuid,
  kind          text not null,
  payload       jsonb not null default '{}'::jsonb,
  received_at   timestamptz not null default now(),
  processed_at  timestamptz,
  foreign key (model_id, brand_id) references public.models (id, brand_id) on delete set null,
  foreign key (trim_id, brand_id)  references public.trims  (id, brand_id) on delete set null,
  constraint events_payload_object check (jsonb_typeof(payload) = 'object'),
  constraint events_kind_format check (kind ~ '^[a-z0-9][a-z0-9_.-]{0,62}$')
);

create index events_brand_idx   on public.events (brand_id, received_at desc);
create index events_session_idx on public.events (session_id);
create index events_unprocessed_idx on public.events (received_at) where processed_at is null;

-- Write-once: a raw event is never edited or deleted, because every aggregate is derived from it
-- and must stay rebuildable. The one permitted change is stamping processed_at, once.
create or replace function app_auth.events_write_once()
returns trigger language plpgsql set search_path = '' as $fn$
begin
  if tg_op = 'DELETE' then
    raise exception 'events are write-once: rows cannot be deleted';
  end if;
  if old.processed_at is not null then
    raise exception 'event % has already been processed', old.id;
  end if;
  if new.id is distinct from old.id
     or new.session_id is distinct from old.session_id
     or new.brand_id is distinct from old.brand_id
     or new.market_code is distinct from old.market_code
     or new.model_id is distinct from old.model_id
     or new.trim_id is distinct from old.trim_id
     or new.kind is distinct from old.kind
     or new.payload is distinct from old.payload
     or new.received_at is distinct from old.received_at then
    raise exception 'events are write-once: only processed_at may be set';
  end if;
  return new;
end $fn$;

create trigger events_write_once_guard
  before update or delete on public.events
  for each row execute function app_auth.events_write_once();

-- ============================================================================================
-- dead letters — any row here is an incident
-- ============================================================================================
-- The source payload is kept verbatim so a replay reconstructs exactly what was sent. A lead_dlq
-- row therefore holds PII, which is why neither table has a brand-facing read path: only Autoverse
-- staff see dead letters, and only the retry worker (service role) touches them.
create table public.event_dlq (
  id                uuid primary key default gen_random_uuid(),
  source_payload    jsonb not null,
  error_message     text not null,
  error_code        text,
  attempts          integer not null default 0,
  last_attempted_at timestamptz,
  created_at        timestamptz not null default now(),
  constraint event_dlq_payload_object check (jsonb_typeof(source_payload) = 'object'),
  constraint event_dlq_attempts_non_negative check (attempts >= 0)
);

create table public.lead_dlq (
  id                uuid primary key default gen_random_uuid(),
  source_payload    jsonb not null,
  error_message     text not null,
  error_code        text,
  attempts          integer not null default 0,
  last_attempted_at timestamptz,
  created_at        timestamptz not null default now(),
  constraint lead_dlq_payload_object check (jsonb_typeof(source_payload) = 'object'),
  constraint lead_dlq_attempts_non_negative check (attempts >= 0)
);

create index event_dlq_pending_idx on public.event_dlq (created_at) where attempts < 5;
create index lead_dlq_pending_idx  on public.lead_dlq  (created_at) where attempts < 5;

-- ============================================================================================
-- RLS — no consumer read path anywhere in this file
-- ============================================================================================
alter table public.leads           enable row level security;
alter table public.lead_activities enable row level security;
alter table public.events          enable row level security;
alter table public.event_dlq       enable row level security;
alter table public.lead_dlq        enable row level security;

create policy leads_staff_read on public.leads
  for select using ((select app_auth.is_autoverse_staff()));
create policy leads_brand_read on public.leads
  for select using (brand_id = (select app_auth.current_brand_id()));

create policy lead_activities_staff_read on public.lead_activities
  for select using ((select app_auth.is_autoverse_staff()));
create policy lead_activities_brand_read on public.lead_activities
  for select using (brand_id = (select app_auth.current_brand_id()));

create policy events_staff_read on public.events
  for select using ((select app_auth.is_autoverse_staff()));
create policy events_brand_read on public.events
  for select using (brand_id = (select app_auth.current_brand_id()));

-- Dead letters are an operational surface, not a brand-facing one: a row can hold another brand's
-- payload if routing itself is what failed, so only staff read them.
create policy event_dlq_staff_read on public.event_dlq
  for select using ((select app_auth.is_autoverse_staff()));
create policy lead_dlq_staff_read on public.lead_dlq
  for select using ((select app_auth.is_autoverse_staff()));

revoke insert, update, delete, truncate on public.leads           from anon, authenticated;
revoke insert, update, delete, truncate on public.lead_activities from anon, authenticated;
revoke insert, update, delete, truncate on public.events          from anon, authenticated;
revoke insert, update, delete, truncate on public.event_dlq       from anon, authenticated;
revoke insert, update, delete, truncate on public.lead_dlq        from anon, authenticated;
