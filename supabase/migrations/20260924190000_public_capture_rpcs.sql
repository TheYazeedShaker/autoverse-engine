-- 20260924190000_public_capture_rpcs.sql
-- ENGINE-CORE-1A — anonymous capture without the service role (1·A blocker 2, part 2).
--
-- Owner decision (#build-decisions): the public edge functions ingest-event and capture-lead drop
-- the service role (production plan §3.1). They call the database with the ANON key, through two
-- SECURITY DEFINER functions, and nothing else. The owner's guardrails, all enforced here:
--   * search_path pinned on both;
--   * EXECUTE revoked from PUBLIC and granted to anon on these two only;
--   * the rate-limit table stays unreadable by anon (it lives in app_auth, with no grants);
--   * the brand is resolved server-side from origin + publishable key, never from the body;
--   * both are in the isolation test: brand A's key can never write brand B's rows.
--
-- One more control. The anon key is public, so anyone could call these functions directly and skip
-- the edge function, and with it the bot check. Each call must therefore carry the gateway secret
-- that only the edge functions hold (Edge secret CAPTURE_GATEWAY_SECRET, Vault
-- capture_gateway_secret). A direct call gets the same answer as a wrong key.
--
-- Rate limits (production plan: "rate-limited edge ingestion", no numbers given). Starting values,
-- tunable in one place below:
--   leads:  5 per client per 10 min,   300 per brand per 10 min
--   events: 300 per client per minute, 20000 per brand per minute

-- ============================================================================================
-- Shared gate: gateway secret, caller resolution, rate limit
-- ============================================================================================
create or replace function app_auth.admit_public_call(
  p_gateway text, p_key text, p_origin text, p_market_code text, p_client text,
  p_kind text, p_client_limit integer, p_brand_limit integer, p_window_seconds integer
)
returns table (brand_id uuid, market_code text)
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  gateway text;
  caller record;
begin
  select decrypted_secret into gateway from vault.decrypted_secrets where name = 'capture_gateway_secret';
  if gateway is null or p_gateway is distinct from gateway then
    raise exception 'not authorized' using errcode = 'insufficient_privilege';
  end if;

  select * into caller from app_auth.resolve_public_caller(p_key, p_origin, p_market_code);
  if caller.brand_id is null then
    raise exception 'not authorized' using errcode = 'insufficient_privilege';
  end if;

  -- The client id is an HMAC the edge function computes (never a raw IP), so it has a fixed shape.
  if p_client is null or p_client !~ '^[0-9a-f]{32,64}$' then
    raise exception 'client id missing or malformed' using errcode = 'invalid_parameter_value';
  end if;

  -- Per client, and per brand so rotating clients are still capped.
  if not app_auth.take_rate_limit(p_kind || ':' || caller.brand_id || ':' || p_client, p_client_limit, p_window_seconds)
     or not app_auth.take_rate_limit(p_kind || ':' || caller.brand_id, p_brand_limit, p_window_seconds) then
    raise exception 'rate limited' using errcode = 'AV429';
  end if;

  return query select caller.brand_id, caller.market_code;
end $fn$;

revoke execute on function app_auth.admit_public_call(text, text, text, text, text, text, integer, integer, integer)
  from public, anon, authenticated;

-- ============================================================================================
-- capture_lead_public
-- ============================================================================================
-- Returns only a status, never a lead id: an anonymous caller learns nothing it didn't send.
-- A sender's mistake (missing consent, a reused submission_id for a different person, a bad
-- value) is raised back so the edge function can answer 4xx. Anything else is our failure, and the
-- lead goes to the dead-letter queue intact rather than being lost.
create or replace function public.capture_lead_public(
  p_gateway text, p_key text, p_origin text, p_market_code text, p_client text, p_lead jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  caller record;
  payload jsonb;
begin
  select * into caller from app_auth.admit_public_call(
    p_gateway, p_key, p_origin, p_market_code, p_client, 'lead', 5, 300, 600);

  if p_lead is null or jsonb_typeof(p_lead) <> 'object' then
    raise exception 'lead must be an object' using errcode = 'invalid_parameter_value';
  end if;

  -- The brand and market are the resolved ones. Whatever the body said is discarded.
  payload := (p_lead - 'brand_id' - 'market_code' - 'source')
             || jsonb_build_object('brand_id', caller.brand_id, 'market_code', caller.market_code,
                                   'source', 'consumer-form');

  begin
    perform public.capture_lead(payload);
  exception
    when check_violation or unique_violation or not_null_violation or foreign_key_violation
      or invalid_text_representation or invalid_datetime_format or datetime_field_overflow
      or string_data_right_truncation or invalid_parameter_value then
      raise;
    when others then
      insert into public.lead_dlq (source_payload, error_message)
      values (payload, 'capture_lead failed: ' || sqlstate);
      return jsonb_build_object('status', 'dead_lettered');
  end;

  return jsonb_build_object('status', 'captured');
end $fn$;

-- ============================================================================================
-- ingest_events_public
-- ============================================================================================
-- p_events: events that passed the edge function's schema. p_rejected: ones that didn't, as
-- { source_payload, error_message }, so they are dead-lettered rather than lost (the edge function
-- no longer holds a key that can write event_dlq). An event that fails to store for any reason is
-- dead-lettered here. The endpoint never loses an event it accepted.
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
  accepted integer := 0;
  dead integer := 0;
begin
  select * into caller from app_auth.admit_public_call(
    p_gateway, p_key, p_origin, p_market_code, p_client, 'event', 300, 20000, 60);

  if jsonb_typeof(p_events) <> 'array' or jsonb_typeof(p_rejected) <> 'array'
     or jsonb_array_length(p_events) + jsonb_array_length(p_rejected) > 100 then
    raise exception 'events must be arrays of at most 100 in total' using errcode = 'invalid_parameter_value';
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

-- ============================================================================================
-- Grants: anon executes these two, and nothing else new
-- ============================================================================================
revoke execute on function public.capture_lead_public(text, text, text, text, text, jsonb)               from public, authenticated;
revoke execute on function public.ingest_events_public(text, text, text, text, text, jsonb, jsonb)       from public, authenticated;
grant  execute on function public.capture_lead_public(text, text, text, text, text, jsonb)               to anon;
grant  execute on function public.ingest_events_public(text, text, text, text, text, jsonb, jsonb)       to anon;
