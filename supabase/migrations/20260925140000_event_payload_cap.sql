-- 20260925140000_event_payload_cap.sql
-- ENGINE-CORE-1A — an event's payload is at most 8 KB, and an oversized one is refused, not stored.
--
-- Fixes BLOCK finding #9 (owner decision, #build-decisions, 2026-09-25; ADR 0016). Event payloads
-- were unbounded, in a write-once table that can never be trimmed or scrubbed.
--
--   * events_payload_size: a CHECK, so the limit holds for every writer — ingest_events_public,
--     the job worker's dead-letter replays through PostgREST, and anything added later.
--   * ingest_events_public refuses a batch holding an oversized payload BEFORE writing anything.
--     Without that, the CHECK would fail inside the insert, and the function's own exception
--     handler would dead-letter the oversized event verbatim into event_dlq, the one outcome the
--     decision rules out. The refusal is returned, not raised, so the rate-limit hit is kept (the
--     same rule capture_lead_public follows for a sender's mistake). The edge function answers 413.
--
-- The limit is measured as Postgres renders the payload (octet_length(payload::text)), 8192 bytes.
-- The owner checked the hosted table first: no existing row is over it.

alter table public.events
  add constraint events_payload_size check (octet_length(payload::text) <= 8192);

create or replace function public.ingest_events_public(
  p_gateway text, p_key text, p_origin text, p_market_code text, p_client text,
  p_events jsonb, p_rejected jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  caller record;
  ev jsonb;
  bad jsonb;
  total integer;
  accepted integer := 0;
  dead integer := 0;
begin
  if jsonb_typeof(p_events) is distinct from 'array' or jsonb_typeof(p_rejected) is distinct from 'array' then
    raise exception 'events must be arrays' using errcode = 'invalid_parameter_value';
  end if;
  total := jsonb_array_length(p_events) + jsonb_array_length(p_rejected);
  if total < 1 or total > 100 then
    raise exception 'a batch holds 1 to 100 events' using errcode = 'invalid_parameter_value';
  end if;

  select * into caller from app_auth.admit_public_call(
    p_gateway, p_key, p_origin, p_market_code, p_client, 'event', total, 300, 20000, 60, true);

  -- An oversized payload is the sender's mistake: the whole batch is refused and nothing is
  -- written, to events or to event_dlq. A reject carries the raw event as source_payload.
  if exists (
       select 1 from jsonb_array_elements(p_events) e
        where octet_length(coalesce(e.value -> 'payload', '{}'::jsonb)::text) > 8192)
     or exists (
       select 1 from jsonb_array_elements(p_rejected) r
        where octet_length(coalesce(r.value -> 'source_payload' -> 'payload', 'null'::jsonb)::text) > 8192)
  then
    return jsonb_build_object('accepted', 0, 'dead_lettered', 0, 'refused', 'payload_too_large');
  end if;

  for ev in select value from jsonb_array_elements(p_events) loop
    -- Stamped with the resolved brand and market, whatever the event said.
    ev := (ev - 'brand_id' - 'market_code')
          || jsonb_build_object('brand_id', caller.brand_id, 'market_code', caller.market_code);
    begin
      insert into public.events (id, session_id, brand_id, market_code, model_id, trim_id, kind, payload)
      values (
        (ev ->> 'id')::uuid,
        nullif(ev ->> 'session_id', '')::uuid,
        caller.brand_id,
        caller.market_code,
        nullif(ev ->> 'model_id', '')::uuid,
        nullif(ev ->> 'trim_id', '')::uuid,
        ev ->> 'kind',
        coalesce(ev -> 'payload', '{}'::jsonb)
      )
      on conflict (id) do nothing;
      accepted := accepted + 1;
    exception when others then
      insert into public.event_dlq (source_payload, error_message)
      values (ev, 'ingest failed: ' || sqlstate);
      dead := dead + 1;
    end;
  end loop;

  for bad in select value from jsonb_array_elements(p_rejected) loop
    insert into public.event_dlq (source_payload, error_message)
    values (
      case when jsonb_typeof(bad -> 'source_payload') = 'object'
           then (bad -> 'source_payload') || jsonb_build_object('brand_id', caller.brand_id, 'market_code', caller.market_code)
           else jsonb_build_object('value', bad -> 'source_payload', 'brand_id', caller.brand_id) end,
      left(coalesce(bad ->> 'error_message', 'rejected at the edge'), 500)
    );
    dead := dead + 1;
  end loop;

  return jsonb_build_object('accepted', accepted, 'dead_lettered', dead);
end $fn$;

-- create or replace keeps the existing grants; restated so this file stands on its own.
revoke execute on function public.ingest_events_public(text, text, text, text, text, jsonb, jsonb) from public, authenticated;
grant  execute on function public.ingest_events_public(text, text, text, text, text, jsonb, jsonb) to anon;
