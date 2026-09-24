-- 0012_lead_submission_id.test.sql
-- MANDATORY test for migration 20260924151000_lead_submission_id.sql (BLOCK finding #6).
-- Proves: replaying one submission any number of times ends in one lead, one activity and one set
-- of routing jobs; a capture without a submission_id is refused; the key is scoped per brand, so
-- one brand's submission can never collide with or reveal another brand's lead.

begin;

create schema test_helpers;
create function test_helpers.try(stmt text) returns text language plpgsql as $$
begin
  execute stmt;
  return '';
exception when others then
  return sqlerrm;
end $$;

insert into public.brands (id, slug, name) values
  ('00000000-0000-0000-0000-00000000000a', 'brand-a', 'Brand A'),
  ('00000000-0000-0000-0000-00000000000b', 'brand-b', 'Brand B');
insert into public.brand_markets (brand_id, market_code, currency, locale, live) values
  ('00000000-0000-0000-0000-00000000000a', 'EG', 'EGP', 'ar-EG', true),
  ('00000000-0000-0000-0000-00000000000b', 'EG', 'EGP', 'ar-EG', true);

create function test_helpers.submission(brand uuid, submission uuid) returns jsonb language sql as $$
  select jsonb_build_object(
    'brand_id', brand, 'market_code', 'EG',
    'full_name', 'Fatma Hassan', 'phone', '+201000000001',
    'consent_text_version', 'eg-v1', 'consent_at', now()::text,
    'submission_id', submission);
$$;

-- ---- 1. the same submission, captured three times, is one lead ----
do $$
declare first_id uuid; second_id uuid; third_id uuid; n int;
begin
  first_id  := public.capture_lead(test_helpers.submission('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000d001'));
  second_id := public.capture_lead(test_helpers.submission('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000d001'));
  third_id  := public.capture_lead(test_helpers.submission('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000d001'));

  if second_id is distinct from first_id or third_id is distinct from first_id then
    raise exception 'CRITICAL: a replayed submission produced a different lead id';
  end if;

  select count(*) into n from public.leads where brand_id = '00000000-0000-0000-0000-00000000000a';
  if n <> 1 then raise exception 'CRITICAL: one submission captured three times made % leads', n; end if;

  select count(*) into n from public.lead_activities where lead_id = first_id;
  if n <> 1 then raise exception 'CRITICAL: a replay added activities to the audit trail (% rows)', n; end if;

  select count(*) into n from public.jobs where payload ->> 'lead_id' = first_id::text;
  if n <> 2 then raise exception 'CRITICAL: a replay queued % routing jobs — the brand would hear twice', n; end if;

  raise notice 'PASS: replaying one submission ends in one lead, one activity and one set of routing jobs';
end $$;

-- ---- 2. the replay does not depend on the job still being outstanding ----
-- The routing jobs finishing frees their dedupe key; the submission key must still hold.
do $$
declare n int;
begin
  update public.jobs set status = 'done';
  perform public.capture_lead(test_helpers.submission('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000d001'));
  select count(*) into n from public.jobs;
  if n <> 2 then raise exception 'CRITICAL: a replay after routing finished queued it again (% jobs)', n; end if;
  raise notice 'PASS: a late replay, after the brand was already notified, notifies nobody';
end $$;

-- ---- 3. no submission id, no lead ----
do $$
declare msg text;
begin
  msg := test_helpers.try($q$select public.capture_lead(
    test_helpers.submission('00000000-0000-0000-0000-00000000000a', null) - 'submission_id')$q$);
  if msg not like '%submission_id is required%' then
    raise exception 'CRITICAL: a lead was captured without an idempotency key (%)', msg;
  end if;
  raise notice 'PASS: a capture without a submission_id is refused';
end $$;

-- ---- 3b. a reused key carrying a DIFFERENT lead is refused, not silently absorbed ----
do $
declare msg text;
begin
  msg := test_helpers.try($q$select public.capture_lead(
    test_helpers.submission('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000d001')
      || '{"full_name": "Someone Else", "phone": "+201000000077"}'::jsonb)$q$);
  if msg not like '%already used for a different lead%' then
    raise exception 'CRITICAL: a different person under a reused submission id was dropped behind a success (%)', msg;
  end if;
  raise notice 'PASS: a reused submission id with different details is refused';
end $;

-- ---- 4. the key is per brand ----
do $$
declare a_id uuid; b_id uuid;
begin
  select id into a_id from public.leads where brand_id = '00000000-0000-0000-0000-00000000000a';
  b_id := public.capture_lead(test_helpers.submission('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000d001'));
  if b_id is null or b_id = a_id then
    raise exception 'CRITICAL: brand B reusing a submission id got brand A''s lead back';
  end if;
  if (select brand_id from public.leads where id = b_id) <> '00000000-0000-0000-0000-00000000000b' then
    raise exception 'CRITICAL: brand B''s capture landed under another brand';
  end if;
  raise notice 'PASS: submission ids are scoped per brand — no cross-brand collision or disclosure';
end $$;

rollback;
