-- 20260922234823_capture_lead.sql
-- ENGINE-CORE-1A Slice 8 — the transactional half of the leads pipeline.
--
-- The slice requires a lead, its consent and its first activity to be written "in one transaction".
-- An edge function using PostgREST cannot do that: two inserts are two statements, and a crash
-- between them leaves a lead with no audit trail — or worse, a lead whose consent record never
-- landed. A function is one statement from the caller's point of view, so the whole write either
-- happens or does not.
--
-- SECURITY DEFINER because leads have no write policy: the service role is the only writer, and
-- this is the shape of that write. EXECUTE is revoked from anon and authenticated, so a browser
-- cannot call it even though it lives in the exposed schema.

create or replace function public.capture_lead(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  new_lead public.leads%rowtype;
  consent_version text := payload ->> 'consent_text_version';
  consent_moment  timestamptz;
begin
  -- Consent is hard-required. Rejecting here as well as in the column constraint means the error
  -- says what is wrong, rather than surfacing as a not-null violation nobody can act on.
  if consent_version is null or length(btrim(consent_version)) = 0 then
    raise exception 'consent_text_version is required' using errcode = 'check_violation';
  end if;
  if (payload ->> 'consent_at') is null then
    raise exception 'consent_at is required' using errcode = 'check_violation';
  end if;
  consent_moment := (payload ->> 'consent_at')::timestamptz;

  insert into public.leads (
    brand_id, market_code, full_name, phone, city, model_id, trim_id,
    preferred_time, type, consent_text_version, consent_at, session_id
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
    nullif(payload ->> 'session_id', '')::uuid
  )
  returning * into new_lead;

  -- The first activity is part of the same write: a lead always has a history, starting with the
  -- moment it arrived and the consent it arrived with.
  insert into public.lead_activities (brand_id, lead_id, actor_id, kind, payload)
  values (
    new_lead.brand_id,
    new_lead.id,
    null,  -- the engine itself, not a person
    'note',
    jsonb_build_object(
      'event', 'captured',
      'consent_text_version', consent_version,
      'consent_at', consent_moment,
      'source', coalesce(payload ->> 'source', 'consumer-form')
    )
  );

  return new_lead.id;
end $fn$;

-- The service role only. A browser must never reach this, even though public is the exposed schema.
revoke execute on function public.capture_lead(jsonb) from public, anon, authenticated;
grant execute on function public.capture_lead(jsonb) to service_role;
