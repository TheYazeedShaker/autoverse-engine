-- 20260926152100_attribute_vocabulary.sql
-- PAGE-CONSUMER-SHOWROOM, owner decision (#build-decisions, 2026-09-26, option B).
--
-- models.body_type, fuel, fuel_category, drive, transmission and trims.drive were single-language
-- free text. They become KEYS into vocabulary_registry, which already carries display_en and
-- display_ar. The showroom's filters and counts group by key ("EV" and "Electric" can no longer
-- split a facet), and the page shows the display value for the active language. There is no
-- vocabulary in page code: a second brand works by data alone.
--
--   body_type          → kind 'body_type'     ('suv', 'sedan', …)
--   fuel, fuel_category → kind 'fuel'         (fuel is the model's own; fuel_category the filter group)
--   drive (both tables) → kind 'drive'        ('fwd', 'rwd', 'awd', '4wd')
--   transmission       → kind 'transmission'  ('automatic-8-speed', 'single-speed', …)
--
-- Integrity follows option_assignments' pattern: a foreign key on (key, kind) → registry (id, kind),
-- so a drive key can't be stored as a body type. Each reference carries a fixed kind column
-- (default + CHECK), because a foreign key needs a column on both sides. Using a key marks it
-- ever_used, so it can never be renamed or deleted afterwards (the registry's existing trigger).
--
-- Existing rows: free-text values are mapped to keys by id or English display name, case- and
-- whitespace-insensitively. Anything that doesn't map ABORTS the migration and names the values,
-- rather than guessing or silently nulling data. See the PR for the pre-check query.

-- ============================================================================================
-- 1. configurator options keep their own four kinds
-- ============================================================================================
-- option_kind now also names attribute vocabulary. An option assignment (a model's paint, wheels,
-- trim) must never be one of those.
alter table public.option_assignments
  add constraint option_assignments_kind_is_option
  check (kind in ('exterior_color', 'interior_color', 'wheel', 'interior_theme'));

-- ============================================================================================
-- 2. seed: generic keys, EN + AR (no brand wording)
-- ============================================================================================
insert into public.vocabulary_registry (id, kind, display_en, display_ar) values
  ('suv',                'body_type',    'SUV',                  'إس يو في'),
  ('sedan',              'body_type',    'Sedan',                'سيدان'),
  ('hatchback',          'body_type',    'Hatchback',            'هاتشباك'),
  ('coupe',              'body_type',    'Coupe',                'كوبيه'),
  ('pickup',             'body_type',    'Pickup',               'بيك أب'),
  ('mpv',                'body_type',    'MPV',                  'متعددة الأغراض'),
  ('petrol',             'fuel',         'Petrol',               'بنزين'),
  ('diesel',             'fuel',         'Diesel',               'ديزل'),
  ('hybrid',             'fuel',         'Hybrid',               'هجين'),
  ('phev',               'fuel',         'Plug-in hybrid',       'هجين قابل للشحن'),
  ('ev',                 'fuel',         'Electric',             'كهربائي'),
  ('fwd',                'drive',        'FWD',                  'دفع أمامي'),
  ('rwd',                'drive',        'RWD',                  'دفع خلفي'),
  ('awd',                'drive',        'AWD',                  'دفع كلي'),
  ('4wd',                'drive',        '4WD',                  'دفع رباعي'),
  ('automatic',          'transmission', 'Automatic',            'أوتوماتيك'),
  ('automatic-6-speed',  'transmission', '6-speed automatic',    'أوتوماتيك 6 سرعات'),
  ('automatic-8-speed',  'transmission', '8-speed automatic',    'أوتوماتيك 8 سرعات'),
  ('automatic-10-speed', 'transmission', '10-speed automatic',   'أوتوماتيك 10 سرعات'),
  ('manual',             'transmission', 'Manual',               'يدوي'),
  ('dct',                'transmission', 'Dual-clutch',          'ثنائي القابض'),
  ('cvt',                'transmission', 'CVT',                  'ناقل حركة متغير باستمرار'),
  ('single-speed',       'transmission', 'Single-speed',         'سرعة واحدة')
on conflict (id) do nothing;

-- ============================================================================================
-- 3. map existing free text to keys, or abort
-- ============================================================================================
create function pg_temp.vocab_key(p_value text, p_kind public.option_kind)
returns text language sql stable as $fn$
  select coalesce(
    (select v.id from public.vocabulary_registry v
      where v.kind = p_kind
        and (v.id = lower(btrim(p_value)) or lower(v.display_en) = lower(btrim(p_value)))
      order by (v.id = lower(btrim(p_value))) desc
      limit 1),
    p_value)
$fn$;

update public.models set
  body_type     = pg_temp.vocab_key(body_type, 'body_type'),
  fuel          = pg_temp.vocab_key(fuel, 'fuel'),
  fuel_category = pg_temp.vocab_key(fuel_category, 'fuel'),
  drive         = pg_temp.vocab_key(drive, 'drive'),
  transmission  = pg_temp.vocab_key(transmission, 'transmission')
where body_type is not null or fuel is not null or fuel_category is not null
   or drive is not null or transmission is not null;

update public.trims set drive = pg_temp.vocab_key(drive, 'drive') where drive is not null;

do $$
declare unmapped text;
begin
  select string_agg(distinct format('%s=%L', col, val), ', ') into unmapped
  from (
    select 'models.body_type' col, body_type val, 'body_type'::public.option_kind k from public.models where body_type is not null
    union all select 'models.fuel', fuel, 'fuel' from public.models where fuel is not null
    union all select 'models.fuel_category', fuel_category, 'fuel' from public.models where fuel_category is not null
    union all select 'models.drive', drive, 'drive' from public.models where drive is not null
    union all select 'models.transmission', transmission, 'transmission' from public.models where transmission is not null
    union all select 'trims.drive', drive, 'drive' from public.trims where drive is not null
  ) x
  where not exists (select 1 from public.vocabulary_registry v where v.id = x.val and v.kind = x.k);
  if unmapped is not null then
    raise exception 'attribute values with no vocabulary key: %', unmapped
      using hint = 'Add registry rows for them (or correct the rows), then re-run this migration.';
  end if;
end $$;

-- ============================================================================================
-- 4. the foreign keys
-- ============================================================================================
alter table public.models
  add column body_type_kind     public.option_kind not null default 'body_type',
  add column fuel_kind          public.option_kind not null default 'fuel',
  add column fuel_category_kind public.option_kind not null default 'fuel',
  add column drive_kind         public.option_kind not null default 'drive',
  add column transmission_kind  public.option_kind not null default 'transmission',
  add constraint models_body_type_kind_fixed     check (body_type_kind = 'body_type'),
  add constraint models_fuel_kind_fixed          check (fuel_kind = 'fuel'),
  add constraint models_fuel_category_kind_fixed check (fuel_category_kind = 'fuel'),
  add constraint models_drive_kind_fixed         check (drive_kind = 'drive'),
  add constraint models_transmission_kind_fixed  check (transmission_kind = 'transmission'),
  add constraint models_body_type_vocab foreign key (body_type, body_type_kind)
    references public.vocabulary_registry (id, kind) on update restrict,
  add constraint models_fuel_vocab foreign key (fuel, fuel_kind)
    references public.vocabulary_registry (id, kind) on update restrict,
  add constraint models_fuel_category_vocab foreign key (fuel_category, fuel_category_kind)
    references public.vocabulary_registry (id, kind) on update restrict,
  add constraint models_drive_vocab foreign key (drive, drive_kind)
    references public.vocabulary_registry (id, kind) on update restrict,
  add constraint models_transmission_vocab foreign key (transmission, transmission_kind)
    references public.vocabulary_registry (id, kind) on update restrict;

alter table public.trims
  add column drive_kind public.option_kind not null default 'drive',
  add constraint trims_drive_kind_fixed check (drive_kind = 'drive'),
  add constraint trims_drive_vocab foreign key (drive, drive_kind)
    references public.vocabulary_registry (id, kind) on update restrict;

comment on column public.models.body_type is 'vocabulary_registry key, kind body_type';
comment on column public.models.fuel is 'vocabulary_registry key, kind fuel';
comment on column public.models.fuel_category is 'vocabulary_registry key, kind fuel (the filter group)';
comment on column public.models.drive is 'vocabulary_registry key, kind drive';
comment on column public.models.transmission is 'vocabulary_registry key, kind transmission';
comment on column public.trims.drive is 'vocabulary_registry key, kind drive; null inherits the model''s';

-- ============================================================================================
-- 5. a used key is frozen, like an option id
-- ============================================================================================
create or replace function app_auth.mark_attribute_vocabulary_used()
returns trigger language plpgsql security definer set search_path = '' as $fn$
declare keys text[];
begin
  if tg_table_name = 'models' then
    keys := array[new.body_type, new.fuel, new.fuel_category, new.drive, new.transmission];
  else
    keys := array[new.drive];
  end if;
  update public.vocabulary_registry
    set ever_used = true
    where not ever_used and id = any (keys);
  return new;
end $fn$;

revoke execute on function app_auth.mark_attribute_vocabulary_used() from public, anon, authenticated;

create trigger models_mark_attribute_vocabulary_used
  after insert or update of body_type, fuel, fuel_category, drive, transmission on public.models
  for each row execute function app_auth.mark_attribute_vocabulary_used();

create trigger trims_mark_attribute_vocabulary_used
  after insert or update of drive on public.trims
  for each row execute function app_auth.mark_attribute_vocabulary_used();

-- Keys already in use by the mapped rows.
update public.vocabulary_registry v set ever_used = true
where not v.ever_used and v.id in (
  select unnest(array[body_type, fuel, fuel_category, drive, transmission]) from public.models
  union
  select drive from public.trims
);
