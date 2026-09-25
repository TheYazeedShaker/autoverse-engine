-- 20260925120000_lead_activities_brand_fk.sql
-- ENGINE-CORE-1A — an activity belongs to the same brand as its lead, enforced by the database.
--
-- Fixes BLOCK finding #7. lead_activities carried two independent foreign keys, brand_id -> brands
-- and lead_id -> leads, and nothing tied them together. A row could name brand B while pointing at
-- brand A's lead. RLS reads brand_id, so brand B would see part of brand A's lead history and
-- brand A's own audit trail would silently be missing that row. capture_lead copies the lead's
-- brand today, but a constraint the database holds does not depend on every future writer doing
-- the same.
--
-- Same shape as leads -> models/trims in 20260922232813_leads_events.sql: the parent exposes
-- unique (id, brand_id) and the child references the pair.
--
-- Adding the constraint validates every existing row, so if a mismatched activity already exists
-- this migration fails rather than carrying it forward. No UPDATE or DELETE touches
-- lead_activities, so its append-only trigger is not involved.

alter table public.leads
  add constraint leads_id_brand_unique unique (id, brand_id);

-- The composite key covers everything the single-column one did, and more.
alter table public.lead_activities
  drop constraint lead_activities_lead_id_fkey;

alter table public.lead_activities
  add constraint lead_activities_lead_brand_fkey
  foreign key (lead_id, brand_id) references public.leads (id, brand_id) on delete cascade;
