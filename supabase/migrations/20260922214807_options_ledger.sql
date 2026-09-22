-- 20260922214807_options_ledger.sql
-- ENGINE-CORE-1A Slice 2 — options and the spec ledger.
--
-- vocabulary_registry  the shared ID vocabulary: one row per option id the studio and the engine
--                      both speak ('graphite', 'alloy-19'). Autoverse-wide, not brand-scoped.
-- option_assignments   which options a model actually offers — the configurator's merchandise.
-- spec_tabs/groups/rows  the spec ledger: tabs hold groups, groups hold rows, a row is either one
--                      value for every trim or a value per trim.
--
-- RLS matches slice 1: staff read, owning brand reads its own, signed-in end users read what is
-- published. No write policies — writes go through service-role edge functions.

-- ---------- enums ----------
create type option_kind     as enum ('exterior_color', 'interior_color', 'wheel', 'interior_theme');
create type spec_row_scope  as enum ('all_trims', 'per_trim');

-- ============================================================================================
-- vocabulary_registry — the shared ID vocabulary (admin "System" page)
-- ============================================================================================
-- Not brand-scoped on purpose: the studio and the engine must agree on one spelling of an option
-- id, and the same id means the same thing for every brand.
--
-- ACCEPTED RISK: the ids and display names are readable by every signed-in user, and an option id
-- can carry a brand's wording ('nardo-grey'). A new row before launch is therefore a faint
-- pre-announcement signal. That is the cost of one shared vocabulary that admins pick from rather
-- than inventing ids per brand. If slice 6 resolves display fallbacks server-side instead of as a
-- client join, tighten this policy to staff + brand users.
create table public.vocabulary_registry (
  id          text primary key,
  kind        option_kind not null,
  display_en  text not null,
  display_ar  text not null,
  deprecated  boolean not null default false,
  -- Set the first time this id is assigned, and never cleared. The engine and the studio both spell
  -- this id in files that live outside the database (GLB material names, render filenames), so the
  -- id must stay frozen even after the last assignment is deleted. `on update restrict` alone only
  -- freezes it while a reference exists.
  ever_used   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- Referenced together with `kind` below, so an assignment cannot label a wheel as a paint colour.
  unique (id, kind),
  constraint vocabulary_registry_id_format check (id ~ '^[a-z0-9][a-z0-9-]{0,62}$')
);

create trigger vocabulary_registry_set_updated_at before update on public.vocabulary_registry
  for each row execute function app_auth.set_updated_at();

-- ============================================================================================
-- option_assignments — the options one model offers
-- ============================================================================================
create table public.option_assignments (
  id             uuid primary key default gen_random_uuid(),
  brand_id       uuid not null references public.brands(id) on delete cascade,
  model_id       uuid not null,
  kind           option_kind not null,
  vocabulary_id  text not null,
  -- Optional per-model overrides of the registry's wording ("Graphite" vs "Graphite Metallic").
  display_en     text,
  display_ar     text,
  swatch_hex     text,
  asset_ref      text,
  -- Scope: every trim, or a named set of them.
  all_trims      boolean not null default true,
  trim_ids       uuid[],
  order_index    integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (model_id, kind, vocabulary_id),
  foreign key (model_id, brand_id) references public.models (id, brand_id) on delete cascade,
  -- `on update restrict`: once an id is used, its spelling is frozen. That is what
  -- "immutable once used" means, enforced by the database rather than by convention.
  foreign key (vocabulary_id, kind)
    references public.vocabulary_registry (id, kind) on update restrict on delete restrict,
  constraint option_assignments_scope_coherent check (
    (all_trims and trim_ids is null)
    or (not all_trims and trim_ids is not null and cardinality(trim_ids) > 0)
  ),
  constraint option_assignments_swatch_hex_format check (
    swatch_hex is null or swatch_hex ~ '^#[0-9A-Fa-f]{6}$'
  )
);

create index option_assignments_brand_idx on public.option_assignments (brand_id);
create index option_assignments_model_idx on public.option_assignments (model_id, kind, order_index);

create trigger option_assignments_set_updated_at before update on public.option_assignments
  for each row execute function app_auth.set_updated_at();

-- An array cannot carry a foreign key, so this is the equivalent guarantee: every trim named in
-- trim_ids must belong to THIS model. Without it a per-trim option could quietly reference a trim
-- of another model — or another brand.
create or replace function app_auth.check_option_trim_ids()
returns trigger language plpgsql security definer set search_path = '' as $$
declare stray uuid;
begin
  if new.trim_ids is null then
    return new;
  end if;
  select t.id into stray
  from unnest(new.trim_ids) as t(id)
  where not exists (
    select 1 from public.trims tr where tr.id = t.id and tr.model_id = new.model_id
  )
  limit 1;
  if stray is not null then
    raise exception 'trim % does not belong to model %', stray, new.model_id;
  end if;
  return new;
end $$;

revoke execute on function app_auth.check_option_trim_ids() from public, anon, authenticated;

create trigger option_assignments_check_trim_ids
  before insert or update on public.option_assignments
  for each row execute function app_auth.check_option_trim_ids();

-- Mark the vocabulary id as used, permanently.
create or replace function app_auth.mark_vocabulary_used()
returns trigger language plpgsql security definer set search_path = '' as $fn$
begin
  update public.vocabulary_registry
    set ever_used = true
    where id = new.vocabulary_id and not ever_used;
  return new;
end $fn$;

revoke execute on function app_auth.mark_vocabulary_used() from public, anon, authenticated;

create trigger option_assignments_mark_vocabulary_used
  after insert on public.option_assignments
  for each row execute function app_auth.mark_vocabulary_used();

-- Once used, an id can never be renamed or removed — not even after its last assignment is gone.
create or replace function app_auth.protect_used_vocabulary()
returns trigger language plpgsql security definer set search_path = '' as $fn$
begin
  if tg_op = 'DELETE' then
    if old.ever_used then
      raise exception 'vocabulary id % has been used and cannot be deleted; deprecate it instead', old.id;
    end if;
    return old;
  end if;
  if old.ever_used and new.id is distinct from old.id then
    raise exception 'vocabulary id % has been used and cannot be renamed', old.id;
  end if;
  return new;
end $fn$;

revoke execute on function app_auth.protect_used_vocabulary() from public, anon, authenticated;

create trigger vocabulary_registry_protect_used
  before update or delete on public.vocabulary_registry
  for each row execute function app_auth.protect_used_vocabulary();

-- ============================================================================================
-- spec ledger — tabs → groups → rows
-- ============================================================================================
create table public.spec_tabs (
  id           uuid primary key default gen_random_uuid(),
  brand_id     uuid not null references public.brands(id) on delete cascade,
  model_id     uuid not null,
  key          text not null,
  title_en     text not null,
  title_ar     text not null,
  order_index  integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (model_id, key),
  unique (id, brand_id),
  unique (id, model_id),
  foreign key (model_id, brand_id) references public.models (id, brand_id) on delete cascade
);

create index spec_tabs_model_idx on public.spec_tabs (model_id, order_index);
create index spec_tabs_brand_idx on public.spec_tabs (brand_id);

create table public.spec_groups (
  id           uuid primary key default gen_random_uuid(),
  brand_id     uuid not null references public.brands(id) on delete cascade,
  model_id     uuid not null,
  tab_id       uuid not null,
  title_en     text not null,
  title_ar     text not null,
  note_en      text,
  note_ar      text,
  order_index  integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (id, brand_id),
  unique (id, model_id),
  -- Carrying model_id here keeps the group, its tab and its rows provably on the same model.
  foreign key (tab_id, model_id)   references public.spec_tabs (id, model_id) on delete cascade,
  foreign key (model_id, brand_id) references public.models (id, brand_id)   on delete cascade
);

create index spec_groups_tab_idx   on public.spec_groups (tab_id, order_index);
create index spec_groups_brand_idx on public.spec_groups (brand_id);

create table public.spec_rows (
  id           uuid primary key default gen_random_uuid(),
  brand_id     uuid not null references public.brands(id) on delete cascade,
  model_id     uuid not null,
  group_id     uuid not null,
  key_en       text not null,
  key_ar       text not null,
  scope        spec_row_scope not null default 'all_trims',
  value_en     text,
  value_ar     text,
  -- { "<trim_id>": { "en": "...", "ar": "..." } } — only for per-trim rows.
  trim_values  jsonb,
  order_index  integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  foreign key (group_id, model_id) references public.spec_groups (id, model_id) on delete cascade,
  foreign key (model_id, brand_id) references public.models (id, brand_id)      on delete cascade,
  -- A row is one value for every trim, or a value per trim. Never both, never neither.
  -- "Differs across trims" is DERIVED from this at read time and never stored (REV2).
  constraint spec_rows_scope_coherent check (
    (scope = 'all_trims' and value_en is not null and value_ar is not null and trim_values is null)
    or (scope = 'per_trim' and value_en is null and value_ar is null
        and trim_values is not null and jsonb_typeof(trim_values) = 'object')
  )
);

create index spec_rows_group_idx on public.spec_rows (group_id, order_index);
create index spec_rows_brand_idx on public.spec_rows (brand_id);

create trigger spec_tabs_set_updated_at   before update on public.spec_tabs
  for each row execute function app_auth.set_updated_at();
create trigger spec_groups_set_updated_at before update on public.spec_groups
  for each row execute function app_auth.set_updated_at();
create trigger spec_rows_set_updated_at   before update on public.spec_rows
  for each row execute function app_auth.set_updated_at();

-- Every trim named in a per-trim row must belong to this row's model, for the same reason as
-- option_assignments: a jsonb key cannot carry a foreign key.
create or replace function app_auth.check_spec_row_trim_values()
returns trigger language plpgsql security definer set search_path = '' as $$
declare stray text;
begin
  if new.trim_values is null then
    return new;
  end if;
  select k into stray
  from jsonb_object_keys(new.trim_values) as k
  where not exists (
    select 1 from public.trims tr
    where tr.id::text = k and tr.model_id = new.model_id
  )
  limit 1;
  if stray is not null then
    raise exception 'trim_values references % which is not a trim of model %', stray, new.model_id;
  end if;
  return new;
end $$;

revoke execute on function app_auth.check_spec_row_trim_values() from public, anon, authenticated;

create trigger spec_rows_check_trim_values
  before insert or update on public.spec_rows
  for each row execute function app_auth.check_spec_row_trim_values();

-- ============================================================================================
-- Publish-state helpers for the per-trim payloads
-- ============================================================================================
-- A trim's own row is hidden until it is published (slice 1), but a per-trim payload NAMES trims:
-- option_assignments.trim_ids and spec_rows.trim_values. Without these checks a published model
-- would leak the uuid, the figures and the exclusive options of an unannounced trim to every
-- signed-in account. SECURITY DEFINER so the answer is about publish state, not about what the
-- caller happens to be allowed to see.
create or replace function app_auth.all_trims_published(ids uuid[])
returns boolean language sql stable security definer set search_path = '' as $fn$
  select coalesce(bool_and(t.publish_state = 'published'), true)
  from unnest(coalesce(ids, '{}'::uuid[])) as u(id)
  left join public.trims t on t.id = u.id
$fn$;

create or replace function app_auth.all_trim_keys_published(values_by_trim jsonb)
returns boolean language sql stable security definer set search_path = '' as $fn$
  select coalesce(bool_and(t.publish_state = 'published'), true)
  from jsonb_object_keys(coalesce(values_by_trim, '{}'::jsonb)) as k
  left join public.trims t on t.id::text = k
$fn$;

-- ============================================================================================
-- RLS — reads only (slice 1's pattern)
-- ============================================================================================
alter table public.vocabulary_registry enable row level security;
alter table public.option_assignments  enable row level security;
alter table public.spec_tabs           enable row level security;
alter table public.spec_groups         enable row level security;
alter table public.spec_rows           enable row level security;

-- The registry is shared reference data with no tenant content: any signed-in user may read it,
-- which is what lets an admin or a brand pick from one vocabulary instead of inventing ids.
create policy vocabulary_registry_read on public.vocabulary_registry
  for select to authenticated using (true);

-- Staff god-view.
create policy option_assignments_staff_read on public.option_assignments
  for select using ((select app_auth.is_autoverse_staff()));
create policy spec_tabs_staff_read on public.spec_tabs
  for select using ((select app_auth.is_autoverse_staff()));
create policy spec_groups_staff_read on public.spec_groups
  for select using ((select app_auth.is_autoverse_staff()));
create policy spec_rows_staff_read on public.spec_rows
  for select using ((select app_auth.is_autoverse_staff()));

-- The owning brand, published or not.
create policy option_assignments_brand_read on public.option_assignments
  for select using (brand_id = (select app_auth.current_brand_id()));
create policy spec_tabs_brand_read on public.spec_tabs
  for select using (brand_id = (select app_auth.current_brand_id()));
create policy spec_groups_brand_read on public.spec_groups
  for select using (brand_id = (select app_auth.current_brand_id()));
create policy spec_rows_brand_read on public.spec_rows
  for select using (brand_id = (select app_auth.current_brand_id()));

-- Signed-in end users: only what hangs off a published model. Same `current_brand_id() is null`
-- clause as slice 1, so a brand never reads a competitor's options or specs.
create policy option_assignments_public_read on public.option_assignments
  for select to authenticated using (
    (select app_auth.current_brand_id()) is null
    and exists (
      select 1 from public.models m
      where m.id = option_assignments.model_id and m.publish_state = 'published'
    )
    -- An option scoped to an unpublished trim stays hidden with it.
    and (all_trims or app_auth.all_trims_published(trim_ids))
  );

create policy spec_tabs_public_read on public.spec_tabs
  for select to authenticated using (
    (select app_auth.current_brand_id()) is null
    and exists (
      select 1 from public.models m
      where m.id = spec_tabs.model_id and m.publish_state = 'published'
    )
  );

create policy spec_groups_public_read on public.spec_groups
  for select to authenticated using (
    (select app_auth.current_brand_id()) is null
    and exists (
      select 1 from public.models m
      where m.id = spec_groups.model_id and m.publish_state = 'published'
    )
  );

create policy spec_rows_public_read on public.spec_rows
  for select to authenticated using (
    (select app_auth.current_brand_id()) is null
    and exists (
      select 1 from public.models m
      where m.id = spec_rows.model_id and m.publish_state = 'published'
    )
    -- A per-trim row carries figures keyed by trim, so it is withheld until every trim it names is
    -- published. Deliberately all-or-nothing: RLS decides rows, not columns, and a partly-visible
    -- jsonb would still carry the unannounced trim's uuid. Slice 6's repository can project the
    -- published subset once it reads through the service role.
    and (scope = 'all_trims' or app_auth.all_trim_keys_published(trim_values))
  );

-- Writes: none. Service-role edge functions only, denied at the privilege layer as well.
-- TRUNCATE is included: Supabase's default privileges grant it, and RLS does not gate it.
revoke insert, update, delete, truncate on public.vocabulary_registry from anon, authenticated;
revoke insert, update, delete, truncate on public.option_assignments  from anon, authenticated;
revoke insert, update, delete, truncate on public.spec_tabs           from anon, authenticated;
revoke insert, update, delete, truncate on public.spec_groups         from anon, authenticated;
revoke insert, update, delete, truncate on public.spec_rows           from anon, authenticated;
