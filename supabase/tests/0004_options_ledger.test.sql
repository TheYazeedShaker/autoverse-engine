-- 0004_options_ledger.test.sql
-- MANDATORY isolation test for migration 20260922214807_options_ledger.sql (1·A Slice 2).
-- Proves: a vocabulary id is immutable once used; an option cannot mislabel its kind, reach a trim
-- of another model, or be both all-trims and per-trim; a spec row is one value or per-trim values,
-- never both; a brand reads only its own options and specs and writes none of them; end users see
-- only what hangs off a published model; anon sees nothing; the service role still writes.
--
-- Runs in CI on every PR (the `isolation` job). A violation RAISES EXCEPTION = a failing test.
-- Rolls back, so no fixture data persists.

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
  ('00000000-0000-0000-0000-0000000000a1'),  -- Brand A admin
  ('00000000-0000-0000-0000-0000000000b1'),  -- Brand B admin
  ('00000000-0000-0000-0000-0000000000c1'),  -- Autoverse ops
  ('00000000-0000-0000-0000-0000000000d1');  -- end user, no profile

insert into public.brands (id, slug, name) values
  ('00000000-0000-0000-0000-00000000000a', 'brand-a', 'Brand A'),
  ('00000000-0000-0000-0000-00000000000b', 'brand-b', 'Brand B');

insert into public.profiles (id, brand_id, brand_role, platform_role) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', 'brand_admin', null),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000b', 'brand_admin', null),
  ('00000000-0000-0000-0000-0000000000c1', null, null, 'ops');

insert into public.models (id, brand_id, slug, name_en, name_ar, publish_state) values
  ('00000000-0000-0000-0000-0000000a1001', '00000000-0000-0000-0000-00000000000a', 'a-published', 'A Published', 'أ منشور', 'published'),
  ('00000000-0000-0000-0000-0000000a1002', '00000000-0000-0000-0000-00000000000a', 'a-draft',     'A Draft',     'أ مسودة', 'draft'),
  ('00000000-0000-0000-0000-0000000b1001', '00000000-0000-0000-0000-00000000000b', 'b-published', 'B Published', 'ب منشور', 'published');

insert into public.trims (id, brand_id, model_id, slug, name_en, name_ar, publish_state) values
  ('00000000-0000-0000-0000-0000000a2001', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000a1001', 'base',    'Base',    'أساسي',  'published'),
  ('00000000-0000-0000-0000-0000000a2002', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000a1001', 'sport',   'Sport',   'رياضي',  'published'),
  -- A trim of a DIFFERENT model of the same brand: used to prove the trim_ids guard bites.
  ('00000000-0000-0000-0000-0000000a2003', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000a1002', 'preview', 'Preview', 'معاينة', 'draft'),
  ('00000000-0000-0000-0000-0000000b2001', '00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000b1001', 'base',    'Base',    'أساسي',  'published'),
  -- An unannounced variant of a PUBLISHED model. Its own row is hidden by slice 1; the per-trim
  -- payloads below must not name it either.
  ('00000000-0000-0000-0000-0000000a2004', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000a1001', 'secret',  'Secret',  'سري',    'draft');

insert into public.vocabulary_registry (id, kind, display_en, display_ar) values
  ('graphite',  'exterior_color', 'Graphite',  'جرافيت'),
  ('pearl',     'exterior_color', 'Pearl',     'لؤلؤي'),
  ('alloy-19',  'wheel',          '19" Alloy', 'جنوط 19');

insert into public.option_assignments (id, brand_id, model_id, kind, vocabulary_id, swatch_hex, all_trims, order_index) values
  ('00000000-0000-0000-0000-0000000a3001', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000a1001', 'exterior_color', 'graphite', '#3A3A3A', true, 1);
insert into public.option_assignments (id, brand_id, model_id, kind, vocabulary_id, all_trims, trim_ids, order_index) values
  ('00000000-0000-0000-0000-0000000a3002', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000a1001', 'wheel', 'alloy-19', false, array['00000000-0000-0000-0000-0000000a2002']::uuid[], 2);
insert into public.option_assignments (id, brand_id, model_id, kind, vocabulary_id, all_trims) values
  ('00000000-0000-0000-0000-0000000b3001', '00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000b1001', 'exterior_color', 'pearl', true),
  -- Hangs off Brand A's DRAFT model: must stay invisible to end users.
  ('00000000-0000-0000-0000-0000000a3003', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000a1002', 'exterior_color', 'pearl', true);

-- An option and a spec row that exist only for the unannounced trim.
insert into public.option_assignments (id, brand_id, model_id, kind, vocabulary_id, all_trims, trim_ids) values
  ('00000000-0000-0000-0000-0000000a3004', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000a1001', 'exterior_color', 'pearl', false,
   array['00000000-0000-0000-0000-0000000a2004']::uuid[]);

insert into public.spec_tabs (id, brand_id, model_id, key, title_en, title_ar) values
  ('00000000-0000-0000-0000-0000000a4001', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000a1001', 'performance', 'Performance', 'الأداء'),
  ('00000000-0000-0000-0000-0000000b4001', '00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000b1001', 'performance', 'Performance', 'الأداء');

insert into public.spec_groups (id, brand_id, model_id, tab_id, title_en, title_ar, note_en) values
  ('00000000-0000-0000-0000-0000000a5001', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000a1001', '00000000-0000-0000-0000-0000000a4001', 'Engine', 'المحرك', 'Figures are indicative.'),
  ('00000000-0000-0000-0000-0000000b5001', '00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000b1001', '00000000-0000-0000-0000-0000000b4001', 'Engine', 'المحرك', null);

insert into public.spec_rows (brand_id, model_id, group_id, key_en, key_ar, scope, value_en, value_ar) values
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000a1001', '00000000-0000-0000-0000-0000000a5001', 'Transmission', 'ناقل الحركة', 'all_trims', '8-speed automatic', 'أوتوماتيك 8 سرعات');
insert into public.spec_rows (brand_id, model_id, group_id, key_en, key_ar, scope, trim_values) values
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000a1001', '00000000-0000-0000-0000-0000000a5001', 'Power', 'القوة', 'per_trim',
   '{"00000000-0000-0000-0000-0000000a2001": {"en": "190 hp", "ar": "190 حصان"}, "00000000-0000-0000-0000-0000000a2002": {"en": "240 hp", "ar": "240 حصان"}}'::jsonb);
insert into public.spec_rows (brand_id, model_id, group_id, key_en, key_ar, scope, trim_values) values
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000a1001', '00000000-0000-0000-0000-0000000a5001', 'Secret output', 'الإخراج السري', 'per_trim',
   '{"00000000-0000-0000-0000-0000000a2004": {"en": "650 hp", "ar": "650 حصان"}}'::jsonb);
insert into public.spec_rows (brand_id, model_id, group_id, key_en, key_ar, scope, value_en, value_ar) values
  ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000b1001', '00000000-0000-0000-0000-0000000b5001', 'Transmission', 'ناقل الحركة', 'all_trims', 'CVT', 'CVT');

-- ---- 1. the vocabulary is a contract: ids are immutable once used, kinds cannot be mislabelled ----
do $$
declare msg text;
begin
  msg := test_helpers.try($q$update public.vocabulary_registry set id = 'graphite-metallic' where id = 'graphite'$q$);
  if msg = '' then raise exception 'CRITICAL: a vocabulary id in use was renamed — the studio contract broke silently'; end if;
  -- Either denial is correct: the ever_used lock fires first, the FK restrict backs it up.
  if msg not like '%cannot be renamed%' and msg not like '%violates foreign key constraint%' then
    raise exception 'FAIL: renaming a used vocabulary id failed for the wrong reason (%)', msg;
  end if;

  -- An unused id may still be corrected.
  msg := test_helpers.try($q$update public.vocabulary_registry set display_en = 'Pearl White' where id = 'pearl'$q$);
  if msg <> '' then raise exception 'FAIL: a vocabulary display name could not be corrected (%)', msg; end if;

  -- A wheel id cannot be assigned as a paint colour: (vocabulary_id, kind) is the foreign key.
  msg := test_helpers.try($q$insert into public.option_assignments (brand_id, model_id, kind, vocabulary_id)
    values ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000a1001', 'exterior_color', 'alloy-19')$q$);
  if msg not like '%violates foreign key constraint%' then
    raise exception 'CRITICAL: a wheel was assigned as a paint colour (%)', msg;
  end if;

  -- ...and it stays frozen after the last assignment is gone, because the studio spells these ids
  -- in files that live outside this database.
  delete from public.option_assignments where vocabulary_id = 'graphite';
  msg := test_helpers.try($q$update public.vocabulary_registry set id = 'graphite-metallic' where id = 'graphite'$q$);
  if msg not like '%cannot be renamed%' then
    raise exception 'CRITICAL: a used vocabulary id was renamed once its last assignment was deleted (%)', msg;
  end if;
  msg := test_helpers.try($q$delete from public.vocabulary_registry where id = 'graphite'$q$);
  if msg not like '%cannot be deleted%' then
    raise exception 'CRITICAL: a used vocabulary id was deleted (%)', msg;
  end if;
  -- Restore the fixture for the sections below.
  insert into public.option_assignments (id, brand_id, model_id, kind, vocabulary_id, swatch_hex, all_trims, order_index)
    values ('00000000-0000-0000-0000-0000000a3001', '00000000-0000-0000-0000-00000000000a',
            '00000000-0000-0000-0000-0000000a1001', 'exterior_color', 'graphite', '#3A3A3A', true, 1);

  raise notice 'PASS: vocabulary ids are immutable once used — even after the last assignment is deleted';
end $$;

-- ---- 2. an option cannot reach a trim that is not its model's, or be scoped two ways ----
do $$
declare msg text;
begin
  msg := test_helpers.try($q$insert into public.option_assignments (brand_id, model_id, kind, vocabulary_id, all_trims, trim_ids)
    values ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000a1001', 'exterior_color', 'pearl', false,
            array['00000000-0000-0000-0000-0000000a2003']::uuid[])$q$);
  if msg not like '%does not belong to model%' then
    raise exception 'CRITICAL: an option was scoped to a trim of another model (%)', msg;
  end if;

  msg := test_helpers.try($q$insert into public.option_assignments (brand_id, model_id, kind, vocabulary_id, all_trims, trim_ids)
    values ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000a1001', 'exterior_color', 'pearl', true,
            array['00000000-0000-0000-0000-0000000a2001']::uuid[])$q$);
  if msg not like '%option_assignments_scope_coherent%' then
    raise exception 'FAIL: an option was both all-trims and per-trim (%)', msg;
  end if;

  msg := test_helpers.try($q$insert into public.option_assignments (brand_id, model_id, kind, vocabulary_id, all_trims, trim_ids)
    values ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000a1001', 'exterior_color', 'pearl', false, null)$q$);
  if msg not like '%option_assignments_scope_coherent%' then
    raise exception 'FAIL: a per-trim option was created with no trims (%)', msg;
  end if;

  msg := test_helpers.try($q$insert into public.option_assignments (brand_id, model_id, kind, vocabulary_id, swatch_hex)
    values ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000a1001', 'exterior_color', 'pearl', 'not-a-colour')$q$);
  if msg not like '%option_assignments_swatch_hex_format%' then
    raise exception 'FAIL: a swatch accepted a non-hex value (%)', msg;
  end if;

  raise notice 'PASS: options stay inside their model, and a scope is all-trims or per-trim, never both';
end $$;

-- ---- 3. a spec row is one value or per-trim values, and its trims are its model's ----
do $$
declare msg text;
begin
  msg := test_helpers.try($q$insert into public.spec_rows (brand_id, model_id, group_id, key_en, key_ar, scope, value_en, value_ar, trim_values)
    values ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000a1001', '00000000-0000-0000-0000-0000000a5001',
            'Torque', 'عزم', 'all_trims', 'x', 'x', '{}'::jsonb)$q$);
  if msg not like '%spec_rows_scope_coherent%' then
    raise exception 'FAIL: a spec row carried both a single value and per-trim values (%)', msg;
  end if;

  msg := test_helpers.try($q$insert into public.spec_rows (brand_id, model_id, group_id, key_en, key_ar, scope)
    values ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000a1001', '00000000-0000-0000-0000-0000000a5001',
            'Torque', 'عزم', 'per_trim')$q$);
  if msg not like '%spec_rows_scope_coherent%' then
    raise exception 'FAIL: a per-trim spec row was created with no values (%)', msg;
  end if;

  msg := test_helpers.try($q$insert into public.spec_rows (brand_id, model_id, group_id, key_en, key_ar, scope, trim_values)
    values ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000a1001', '00000000-0000-0000-0000-0000000a5001',
            'Torque', 'عزم', 'per_trim', '{"00000000-0000-0000-0000-0000000a2003": {"en": "x", "ar": "x"}}'::jsonb)$q$);
  if msg not like '%not a trim of model%' then
    raise exception 'CRITICAL: a spec row carried a value for a trim of another model (%)', msg;
  end if;

  -- The core isolation primitive, head-on: Brand B's id with Brand A's model.
  msg := test_helpers.try($q$insert into public.option_assignments (brand_id, model_id, kind, vocabulary_id)
    values ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000a1001', 'interior_color', 'pearl')$q$);
  if msg not like '%violates foreign key constraint%' then
    raise exception 'CRITICAL: an option was attached to another brand''s model (%)', msg;
  end if;

  msg := test_helpers.try($q$insert into public.spec_tabs (brand_id, model_id, key, title_en, title_ar)
    values ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000a1001', 'stolen', 'X', 'X')$q$);
  if msg not like '%violates foreign key constraint%' then
    raise exception 'CRITICAL: a spec tab was attached to another brand''s model (%)', msg;
  end if;

  -- An empty per-trim payload is not a per-trim row.
  msg := test_helpers.try($q$insert into public.spec_rows (brand_id, model_id, group_id, key_en, key_ar, scope, trim_values)
    values ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000a1001', '00000000-0000-0000-0000-0000000a5001',
            'Empty', 'فارغ', 'per_trim', '{}'::jsonb)$q$);
  if msg = '' then
    raise exception 'FAIL: a per-trim spec row was accepted with no per-trim values';
  end if;

  -- A group cannot be hung under another model's tab.
  msg := test_helpers.try($q$insert into public.spec_groups (brand_id, model_id, tab_id, title_en, title_ar)
    values ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000b1001', '00000000-0000-0000-0000-0000000a4001', 'Stolen', 'مسروق')$q$);
  if msg not like '%violates foreign key constraint%' then
    raise exception 'CRITICAL: a spec group was attached to another brand''s tab (%)', msg;
  end if;

  raise notice 'PASS: spec rows are coherent, and the ledger cannot cross a model or a brand';
end $$;

set local role authenticated;

-- ---- 4. Brand A reads its own options and specs, none of Brand B's, and writes nothing ----
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
do $$
declare own int; other int; msg text;
begin
  select count(*) into other from public.option_assignments where brand_id = '00000000-0000-0000-0000-00000000000b';
  if other <> 0 then raise exception 'CRITICAL: Brand A can read Brand B''s options (got %)', other; end if;
  select count(*) into own   from public.option_assignments;
  if own <> 4 then raise exception 'FAIL: Brand A should see its own 4 options (got %)', own; end if;

  select count(*) into other from public.spec_rows where brand_id = '00000000-0000-0000-0000-00000000000b';
  if other <> 0 then raise exception 'CRITICAL: Brand A can read Brand B''s spec rows (got %)', other; end if;
  select count(*) into own   from public.spec_rows;
  if own <> 3 then raise exception 'FAIL: Brand A should see its own 3 spec rows (got %)', own; end if;

  select count(*) into other from public.spec_tabs   where brand_id = '00000000-0000-0000-0000-00000000000b';
  if other <> 0 then raise exception 'CRITICAL: Brand A can read Brand B''s spec tabs (got %)', other; end if;
  select count(*) into other from public.spec_groups where brand_id = '00000000-0000-0000-0000-00000000000b';
  if other <> 0 then raise exception 'CRITICAL: Brand A can read Brand B''s spec groups (got %)', other; end if;

  -- Every write is denied, by privilege or by policy.
  msg := test_helpers.try($q$update public.option_assignments set swatch_hex = '#FFFFFF'
    where brand_id = '00000000-0000-0000-0000-00000000000a'$q$);
  if msg not like '%permission denied%' and msg not like '%row-level security%' then
    if exists (select 1 from public.option_assignments where swatch_hex = '#FFFFFF') then
      raise exception 'CRITICAL: a brand user edited its own option directly';
    end if;
  end if;

  msg := test_helpers.try($q$insert into public.vocabulary_registry (id, kind, display_en, display_ar)
    values ('rogue', 'wheel', 'Rogue', 'مارق')$q$);
  if msg not like '%permission denied%' and msg not like '%row-level security%' then
    raise exception 'CRITICAL: a brand user added to the shared vocabulary (%)', msg;
  end if;

  raise notice 'PASS: Brand A reads only its own options and specs, and writes none of them';
end $$;

-- ---- 5. an end user sees only what hangs off a published model ----
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true);
do $$
declare n int;
begin
  select count(*) into n from public.option_assignments;
  if n <> 3 then raise exception 'FAIL: an end user should see the 3 options on published models (got %)', n; end if;

  select count(*) into n from public.option_assignments where model_id = '00000000-0000-0000-0000-0000000a1002';
  if n <> 0 then raise exception 'CRITICAL: an end user can read options of an unpublished model (got %)', n; end if;

  -- The published model's UNANNOUNCED trim: its own row is hidden, so nothing that names it may
  -- be readable either. This is the leak the security review caught.
  select count(*) into n from public.option_assignments
   where '00000000-0000-0000-0000-0000000a2004' = any(trim_ids);
  if n <> 0 then
    raise exception 'CRITICAL: an option scoped to an unannounced trim leaked it (got %)', n;
  end if;

  select count(*) into n from public.spec_rows
   where trim_values ? '00000000-0000-0000-0000-0000000a2004';
  if n <> 0 then
    raise exception 'CRITICAL: a per-trim spec row leaked an unannounced trim''s figures (got %)', n;
  end if;

  select count(*) into n from public.spec_rows;
  if n <> 3 then raise exception 'FAIL: an end user should see all 3 published spec rows (got %)', n; end if;

  -- The registry is shared reference data: readable, and that is deliberate.
  select count(*) into n from public.vocabulary_registry;
  if n <> 3 then raise exception 'FAIL: the shared vocabulary should be readable (got %)', n; end if;

  raise notice 'PASS: an end user sees options and specs of published models only';
end $$;

-- ---- 6. anon sees nothing at all ----
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$
declare no_ int; ns int; nv int;
begin
  select count(*) into no_ from public.option_assignments;
  select count(*) into ns  from public.spec_rows;
  select count(*) into nv  from public.vocabulary_registry;
  if no_ <> 0 or ns <> 0 or nv <> 0 then
    raise exception 'CRITICAL: anon reads ledger rows (options %, spec rows %, vocabulary %)', no_, ns, nv;
  end if;
  raise notice 'PASS: anon reads nothing — options, specs and vocabulary all closed';
end $$;

-- ---- 7. staff read everything; the service role is still the only writer ----
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
do $$
declare n int;
begin
  select count(*) into n from public.option_assignments;
  if n <> 5 then raise exception 'FAIL: ops staff should see all 5 options (got %)', n; end if;
  select count(*) into n from public.spec_rows;
  if n <> 4 then raise exception 'FAIL: ops staff should see all 4 spec rows (got %)', n; end if;
  raise notice 'PASS: staff read the whole ledger';
end $$;

reset role;
set local role service_role;
-- Drop the previous section's identity so this proves the service role, not a leftover ops user.
select set_config('request.jwt.claims', '', true);
do $$
declare n int; msg text;
begin
  msg := test_helpers.try($q$insert into public.vocabulary_registry (id, kind, display_en, display_ar)
    values ('midnight', 'exterior_color', 'Midnight', 'منتصف الليل')$q$);
  if msg <> '' then raise exception 'CRITICAL: the service role cannot extend the vocabulary (%)', msg; end if;

  msg := test_helpers.try($q$insert into public.option_assignments (brand_id, model_id, kind, vocabulary_id)
    values ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000a1001', 'exterior_color', 'midnight')$q$);
  if msg <> '' then raise exception 'CRITICAL: the service role cannot assign an option (%)', msg; end if;

  delete from public.option_assignments where vocabulary_id = 'midnight';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'CRITICAL: the service role cannot remove an option'; end if;

  raise notice 'PASS: the service role writes options and vocabulary — nobody else does';
end $$;

rollback;
