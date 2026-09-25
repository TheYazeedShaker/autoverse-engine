-- 20260925120000_lead_activity_brand_fk.sql
-- BLOCK finding #7: lead_activities.brand_id was not tied to its lead's brand.
--
-- Every other child table in this schema ties its tenant column to its parent's with a composite
-- foreign key: trims to models, model_versions and content_blocks to models, leads themselves to
-- models and trims. lead_activities was the exception — brand_id pointed at brands, lead_id
-- pointed at leads, and nothing made the two agree. A writer that passed the wrong brand_id would
-- file one brand's audit entry under another brand, and the brand_read policy would then serve
-- that row, payload and all, to the wrong tenant. RLS is doing exactly what it is told; the row is
-- what is wrong.
--
-- The repair is the pattern the rest of the schema already uses, so nothing new is introduced:
-- give leads the composite unique key such a foreign key needs, then replace the single-column
-- lead_id reference with (lead_id, brand_id) -> leads (id, brand_id).
--
-- No data is touched and no behaviour changes. Every writer of this table already supplies the
-- lead's own brand_id — capture_lead in 20260922234823 and 20260924151000, and the routing path in
-- 20260922235103 — so existing rows satisfy the constraint. If one does not, this migration fails
-- rather than leaving a cross-tenant audit row in place, which is the right outcome for an
-- isolation constraint: a mismatch here is an incident, not something to migrate around.

-- The target the composite foreign key resolves against. `id` is already the primary key, so this
-- adds no new uniqueness — it exists so that (id, brand_id) is referenceable, exactly as on
-- public.models and public.trims.
alter table public.leads
  add constraint leads_id_brand_key unique (id, brand_id);

-- Drop the lead-only reference and re-add it carrying the brand. ON DELETE CASCADE is preserved
-- unchanged, and lead_activities.brand_id keeps its own reference to brands (the same belt-and-
-- braces pairing public.trims uses).
alter table public.lead_activities
  drop constraint lead_activities_lead_id_fkey,
  add constraint lead_activities_lead_brand_fkey
    foreign key (lead_id, brand_id) references public.leads (id, brand_id) on delete cascade;
