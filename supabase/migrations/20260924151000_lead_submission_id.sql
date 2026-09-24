-- 20260924151000_lead_submission_id.sql
-- ENGINE-CORE-1A — a lead capture is idempotent on a key the submitter sends.
--
-- Fixes BLOCK finding #6. capture_lead used the lead id it had just generated as the routing
-- dedupe key, so every replay was a new lead. A retried form post, or a lead_dlq replay of a
-- capture that had in fact committed, created a second lead and emailed the brand twice.
--
-- Now the form mints a `submission_id` (a uuid, once per submission, reused on every retry) and
-- the database holds it unique per brand. A capture whose submission_id is already stored returns
-- the existing lead's id and writes nothing: no second lead, no second activity, no second
-- routing job. Replaying one submission any number of times ends in one lead.

-- Leads that predate the key each count as their own submission.
alter table public.leads add column submission_id uuid;
update public.leads set submission_id = gen_random_uuid() where submission_id is null;
alter table public.leads
  alter column submission_id set not null,
  add constraint leads_submission_unique unique (brand_id, submission_id);

create or replace function public.capture_lead(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  new_lead public.leads%rowtype;
  existing_id     uuid;
  consent_version text := payload ->> 'consent_text_version';
  consent_moment  timestamptz;
  submission      uuid;
begin
  if consent_version is null or length(btrim(consent_version)) = 0 then
    raise exception 'consent_text_version is required' using errcode = 'check_violation';
  end if;
  if (payload ->> 'consent_at') is null then
    raise exception 'consent_at is required' using errcode = 'check_violation';
  end if;
  if nullif(payload ->> 'submission_id', '') is null then
    raise exception 'submission_id is required' using errcode = 'check_violation';
  end if;
  consent_moment := (payload ->> 'consent_at')::timestamptz;
  submission     := (payload ->> 'submission_id')::uuid;

  insert into public.leads (
    brand_id, market_code, full_name, phone, city, model_id, trim_id,
    preferred_time, type, consent_text_version, consent_at, session_id, submission_id
  )
  values (
    (payload ->> 'brand_id')::uuid,
    payload ->> 'market_code',
    payload ->> 'full_name',
    payload ->> 'phone',
    payload ->> 'city',
    nullif(payload ->> 'model_id', '')::uuid,
    nullif(payload ->> 'trim_id', '')::uuid,
    payload ->> 'preferred_time',
    coalesce((payload ->> 'type')::public.lead_type, 'contact'),
    consent_version,
    consent_moment,
    nullif(payload ->> 'session_id', '')::uuid,
    submission
  )
  on conflict (brand_id, submission_id) do nothing
  returning * into new_lead;

  -- Already captured: this is a replay. Hand back the lead that exists and write nothing else. The
  -- brand was already routed to it once.
  if new_lead.id is null then
    select id into existing_id from public.leads
     where brand_id = (payload ->> 'brand_id')::uuid and submission_id = submission;
    return existing_id;
  end if;

  insert into public.lead_activities (brand_id, lead_id, actor_id, kind, payload)
  values (
    new_lead.brand_id, new_lead.id, null, 'note',
    jsonb_build_object(
      'event', 'captured',
      'consent_text_version', consent_version,
      'consent_at', consent_moment,
      'source', coalesce(payload ->> 'source', 'consumer-form')
    )
  );

  -- Routing, in the same transaction as the lead. A replay never reaches this point (see above),
  -- so the dedupe key only has to stop a job from being queued twice while it is outstanding.
  insert into public.jobs (kind, payload, dedupe_key)
  values
    ('notify-lead-email',    jsonb_build_object('lead_id', new_lead.id), new_lead.id::text),
    ('deliver-lead-webhook', jsonb_build_object('lead_id', new_lead.id), new_lead.id::text);

  return new_lead.id;
end $fn$;

revoke execute on function public.capture_lead(jsonb) from public, anon, authenticated;
grant execute on function public.capture_lead(jsonb) to service_role;
