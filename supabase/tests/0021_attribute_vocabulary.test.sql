-- 0021_attribute_vocabulary.test.sql
-- Migrations 20260926152000/152100_attribute_vocabulary: body type, fuel, drive and transmission
-- are vocabulary_registry keys.
-- Proves: the seeded keys exist in EN and AR; a model or trim accepts a key of the right kind and
-- refuses free text, an unknown key, or a key of another kind; the kind columns can't be changed;
-- a used key is marked ever_used and can then be neither renamed nor deleted; an option
-- assignment can't use an attribute kind; and signed-in end users can't write the registry.
-- A violation RAISES EXCEPTION. Rolls back, so no fixture data persists.

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

-- ---- 1. the seed ----
do $$
declare missing text;
begin
  select string_agg(k, ', ') into missing
  from unnest(array['suv:body_type', 'ev:fuel', 'petrol:fuel', 'awd:drive', 'rwd:drive',
                    'single-speed:transmission', 'automatic-8-speed:transmission']) k
  where not exists (
    select 1 from public.vocabulary_registry v
    where v.id = split_part(k, ':', 1) and v.kind::text = split_part(k, ':', 2)
      and length(v.display_en) > 0 and length(v.display_ar) > 0);
  if missing is not null then
    raise exception 'FAIL: seeded keys missing or not bilingual: %', missing;
  end if;
  raise notice 'PASS: the demo catalogue''s keys are seeded, EN and AR';
end $$;

insert into public.brands (id, slug, name) values
  ('00000000-0000-0000-0000-00000000021a', 'brand-21', 'Brand 21');
insert into public.vocabulary_registry (id, kind, display_en, display_ar) values
  ('test-21-body', 'body_type', 'Test body', 'هيكل تجريبي');

-- ---- 2. keys of the right kind are accepted; everything else is refused ----
insert into public.models (id, brand_id, slug, name_en, name_ar, body_type, fuel, fuel_category, drive, transmission)
values ('00000000-0000-0000-0000-0000000211a1', '00000000-0000-0000-0000-00000000021a', 'm', 'M', 'م',
        'test-21-body', 'ev', 'ev', 'awd', 'single-speed');
insert into public.trims (id, brand_id, model_id, slug, name_en, name_ar, drive)
values ('00000000-0000-0000-0000-0000000212a1', '00000000-0000-0000-0000-00000000021a',
        '00000000-0000-0000-0000-0000000211a1', 't', 'T', 'ت', 'rwd');

do $$
declare
  msg text;
  m constant text := $t$ where id = '00000000-0000-0000-0000-0000000211a1'$t$;
  cases constant text[][] := array[
    array['models', 'body_type = ''SUV''',          'models_body_type_vocab'],
    array['models', 'body_type = ''no-such-key''',  'models_body_type_vocab'],
    array['models', 'body_type = ''awd''',          'models_body_type_vocab'],
    array['models', 'fuel = ''Electric''',          'models_fuel_vocab'],
    array['models', 'fuel_category = ''suv''',      'models_fuel_category_vocab'],
    array['models', 'drive = ''ev''',               'models_drive_vocab'],
    array['models', 'transmission = ''8-Speed Auto''', 'models_transmission_vocab'],
    array['models', 'body_type_kind = ''fuel''',    'models_body_type_kind_fixed'],
    array['models', 'drive_kind = ''body_type''',   'models_drive_kind_fixed']
  ];
  i int;
begin
  for i in 1 .. array_length(cases, 1) loop
    msg := test_helpers.try('update public.' || cases[i][1] || ' set ' || cases[i][2] || m);
    if msg not like '%' || cases[i][3] || '%' then
      raise exception 'FAIL: "%" was not refused by % (%)', cases[i][2], cases[i][3], msg;
    end if;
  end loop;

  msg := test_helpers.try($q$update public.trims set drive = 'suv'
    where id = '00000000-0000-0000-0000-0000000212a1'$q$);
  if msg not like '%trims_drive_vocab%' then
    raise exception 'FAIL: a trim stored a body type as its drive (%)', msg;
  end if;
  msg := test_helpers.try($q$update public.trims set drive_kind = 'fuel'
    where id = '00000000-0000-0000-0000-0000000212a1'$q$);
  if msg not like '%trims_drive_kind_fixed%' then
    raise exception 'FAIL: a trim''s drive kind could be changed (%)', msg;
  end if;

  -- Null still means "unset" on a model and "inherit" on a trim.
  msg := test_helpers.try($q$update public.trims set drive = null
    where id = '00000000-0000-0000-0000-0000000212a1'$q$);
  if msg <> '' then
    raise exception 'FAIL: a trim could not inherit its drive (%)', msg;
  end if;
  raise notice 'PASS: only keys of the right kind are stored';
end $$;

-- ---- 3. a used key is frozen ----
do $$
declare msg text;
begin
  if not (select ever_used from public.vocabulary_registry where id = 'test-21-body') then
    raise exception 'FAIL: a key used by a model was not marked ever_used';
  end if;
  -- The trim trigger: a key a trim uses (and no model does) is marked too.
  insert into public.vocabulary_registry (id, kind, display_en, display_ar)
    values ('test-21-drive', 'drive', 'Test drive', 'دفع تجريبي');
  update public.trims set drive = 'test-21-drive' where id = '00000000-0000-0000-0000-0000000212a1';
  if not (select ever_used from public.vocabulary_registry where id = 'test-21-drive') then
    raise exception 'FAIL: a key used by a trim was not marked ever_used';
  end if;
  msg := test_helpers.try($q$update public.vocabulary_registry set id = 'test-21-renamed' where id = 'test-21-body'$q$);
  if msg not like '%cannot be renamed%' then
    raise exception 'FAIL: a used attribute key was renamed (%)', msg;
  end if;
  msg := test_helpers.try($q$delete from public.vocabulary_registry where id = 'test-21-body'$q$);
  if msg not like '%cannot be deleted%' then
    raise exception 'FAIL: a used attribute key was deleted (%)', msg;
  end if;
  raise notice 'PASS: a used attribute key can be neither renamed nor deleted';
end $$;

-- ---- 4. option assignments keep their own kinds ----
do $$
declare msg text;
begin
  msg := test_helpers.try($q$insert into public.option_assignments (brand_id, model_id, kind, vocabulary_id)
    values ('00000000-0000-0000-0000-00000000021a', '00000000-0000-0000-0000-0000000211a1', 'fuel', 'ev')$q$);
  if msg not like '%option_assignments_kind_is_option%' then
    raise exception 'FAIL: an option assignment used an attribute kind (%)', msg;
  end if;
  raise notice 'PASS: configurator options can''t be attribute vocabulary';
end $$;

-- ---- 5. end users still can't write the registry ----
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000021d1","role":"authenticated"}', true);
do $$
declare msg text;
begin
  msg := test_helpers.try($q$insert into public.vocabulary_registry (id, kind, display_en, display_ar)
    values ('forged', 'fuel', 'Forged', 'مزور')$q$);
  if msg not like '%permission denied%' and msg not like '%row-level security%' then
    raise exception 'CRITICAL: a signed-in user wrote the vocabulary registry (%)', coalesce(nullif(msg, ''), 'no error');
  end if;
  raise notice 'PASS: the registry stays write-protected';
end $$;
reset role;

rollback;
