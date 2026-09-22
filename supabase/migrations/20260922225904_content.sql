-- 20260922225904_content.sql
-- ENGINE-CORE-1A Slice 4 — content blocks and media.
--
-- model_versions   a numbered delivery of a model from the studio (assets/{brand}/{model}/v{n}/…)
-- assets           the asset registry: what exists, of what kind, for which model/trim/colour/view
-- content_blocks   the authored page content for a model — chapters, features, highlights
-- banner_video     the banner slot for a model, optionally overridden per trim
--
-- The slice says the asset kind enum "grows" to sequence_video | banner_video | per_color_render,
-- and that per-colour renders key on (model_version_id, trim_id, vocabulary_id, view_key). Neither
-- an assets table nor model_versions existed yet, so both are created here — the key the spec names
-- cannot be expressed without them. Flagged in the PR rather than assumed.
--
-- Assets are referenced by PATH, not by foreign key, matching the *_asset_ref columns the spec uses
-- elsewhere: the structured asset store is the source of truth for bytes, this registry is the index.

-- ---------- enums ----------
create type asset_kind as enum (
  -- assumed base kinds (the studio handover and the render farm)
  'source_model', 'render', 'image', 'document',
  -- added by REV2
  'sequence_video', 'banner_video', 'per_color_render'
);

create type content_block_kind as enum ('chapter', 'feature', 'highlight');

-- ============================================================================================
-- model_versions
-- ============================================================================================
create table public.model_versions (
  id          uuid primary key default gen_random_uuid(),
  brand_id    uuid not null references public.brands(id) on delete cascade,
  model_id    uuid not null,
  version     integer not null,
  label       text,
  created_at  timestamptz not null default now(),
  unique (model_id, version),
  unique (id, brand_id),
  unique (id, model_id),
  foreign key (model_id, brand_id) references public.models (id, brand_id) on delete cascade,
  constraint model_versions_version_positive check (version > 0)
);

create index model_versions_brand_idx on public.model_versions (brand_id);

-- ============================================================================================
-- assets
-- ============================================================================================
create table public.assets (
  id                uuid primary key default gen_random_uuid(),
  brand_id          uuid not null references public.brands(id) on delete cascade,
  kind              asset_kind not null,
  -- Path in the structured asset store: assets/{brand}/{model}/v{n}/{source|renders|content}/…
  storage_path      text not null,
  model_id          uuid,
  model_version_id  uuid,
  trim_id           uuid,
  -- Which colour this render shows, in the shared vocabulary (slice 2).
  vocabulary_id     text,
  -- Which camera angle: 'front-3q', 'rear', 'interior'…
  view_key          text,
  width             integer,
  height            integer,
  duration_ms       integer,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (brand_id, storage_path),
  foreign key (model_id, brand_id)         references public.models (id, brand_id) on delete cascade,
  foreign key (model_version_id, brand_id) references public.model_versions (id, brand_id) on delete cascade,
  foreign key (trim_id, brand_id)          references public.trims (id, brand_id) on delete cascade,
  foreign key (vocabulary_id)              references public.vocabulary_registry (id) on update restrict,
  constraint assets_dimensions_positive check (
    (width is null or width > 0) and (height is null or height > 0)
    and (duration_ms is null or duration_ms > 0)
  ),
  -- A per-colour render is only addressable if it says which version, trim, colour and view it is.
  -- That is exactly the key the slice names, so the database refuses a half-identified one.
  constraint assets_per_color_render_fully_keyed check (
    kind <> 'per_color_render'
    or (model_version_id is not null and trim_id is not null
        and vocabulary_id is not null and view_key is not null)
  )
);

-- The per-colour render key from the spec. Partial, so other kinds are unaffected.
create unique index assets_per_color_render_key
  on public.assets (model_version_id, trim_id, vocabulary_id, view_key)
  where kind = 'per_color_render';

create index assets_brand_idx   on public.assets (brand_id, kind);
create index assets_model_idx   on public.assets (model_id, kind);

create trigger assets_set_updated_at before update on public.assets
  for each row execute function app_auth.set_updated_at();

-- ============================================================================================
-- content_blocks — the authored page content for a model
-- ============================================================================================
create table public.content_blocks (
  id                uuid primary key default gen_random_uuid(),
  brand_id          uuid not null references public.brands(id) on delete cascade,
  model_id          uuid not null,
  kind              content_block_kind not null,
  order_index       integer not null default 0,
  kicker_en         text,
  kicker_ar         text,
  headline_en       text not null,
  headline_ar       text not null,
  body_en           text,
  body_ar           text,
  image_asset_ref   text,
  layout_variant    text,
  publish_state     publish_state not null default 'draft',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  foreign key (model_id, brand_id) references public.models (id, brand_id) on delete cascade,
  -- Bilingual or not at all: a block with body copy in one language only would render half-empty
  -- on the other surface.
  constraint content_blocks_body_bilingual check (
    (body_en is null) = (body_ar is null)
  ),
  constraint content_blocks_kicker_bilingual check (
    (kicker_en is null) = (kicker_ar is null)
  )
);

create index content_blocks_model_idx on public.content_blocks (model_id, order_index);
create index content_blocks_brand_idx on public.content_blocks (brand_id);

create trigger content_blocks_set_updated_at before update on public.content_blocks
  for each row execute function app_auth.set_updated_at();

-- ============================================================================================
-- banner_video — one banner per model, optionally overridden per trim
-- ============================================================================================
create table public.banner_video (
  id                uuid primary key default gen_random_uuid(),
  brand_id          uuid not null references public.brands(id) on delete cascade,
  model_id          uuid not null,
  trim_id           uuid,
  asset_ref         text not null,
  poster_asset_ref  text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  foreign key (model_id, brand_id) references public.models (id, brand_id) on delete cascade,
  foreign key (trim_id, brand_id)  references public.trims  (id, brand_id) on delete cascade
);

-- One model-wide banner, and at most one override per trim. Two partial indexes because a null
-- trim_id would otherwise slip past a plain unique constraint as many times as you like.
create unique index banner_video_model_default_key on public.banner_video (model_id) where trim_id is null;
create unique index banner_video_trim_key          on public.banner_video (trim_id)  where trim_id is not null;

create index banner_video_brand_idx on public.banner_video (brand_id);

create trigger banner_video_set_updated_at before update on public.banner_video
  for each row execute function app_auth.set_updated_at();

-- A trim override must belong to the model it overrides.
create or replace function app_auth.check_banner_video_trim()
returns trigger language plpgsql security definer set search_path = '' as $fn$
begin
  if new.trim_id is null then
    return new;
  end if;
  if not exists (
    select 1 from public.trims t where t.id = new.trim_id and t.model_id = new.model_id
  ) then
    raise exception 'trim % does not belong to model %', new.trim_id, new.model_id;
  end if;
  return new;
end $fn$;

revoke execute on function app_auth.check_banner_video_trim() from public, anon, authenticated;

create trigger banner_video_check_trim
  before insert or update on public.banner_video
  for each row execute function app_auth.check_banner_video_trim();

-- ============================================================================================
-- RLS — reads only
-- ============================================================================================
alter table public.model_versions enable row level security;
alter table public.assets         enable row level security;
alter table public.content_blocks enable row level security;
alter table public.banner_video   enable row level security;

create policy model_versions_staff_read on public.model_versions
  for select using ((select app_auth.is_autoverse_staff()));
create policy assets_staff_read on public.assets
  for select using ((select app_auth.is_autoverse_staff()));
create policy content_blocks_staff_read on public.content_blocks
  for select using ((select app_auth.is_autoverse_staff()));
create policy banner_video_staff_read on public.banner_video
  for select using ((select app_auth.is_autoverse_staff()));

create policy model_versions_brand_read on public.model_versions
  for select using (brand_id = (select app_auth.current_brand_id()));
create policy assets_brand_read on public.assets
  for select using (brand_id = (select app_auth.current_brand_id()));
create policy content_blocks_brand_read on public.content_blocks
  for select using (brand_id = (select app_auth.current_brand_id()));
create policy banner_video_brand_read on public.banner_video
  for select using (brand_id = (select app_auth.current_brand_id()));

-- Signed-in end users: published content on published models. A block is published in its own
-- right, so an unpublished chapter stays hidden on an otherwise live page.
create policy content_blocks_public_read on public.content_blocks
  for select to authenticated using (
    (select app_auth.current_brand_id()) is null
    and publish_state = 'published'
    and exists (
      select 1 from public.models m
      where m.id = content_blocks.model_id and m.publish_state = 'published'
    )
  );

-- A banner that overrides an unpublished trim stays hidden with it, same rule as slice 2's options.
create policy banner_video_public_read on public.banner_video
  for select to authenticated using (
    (select app_auth.current_brand_id()) is null
    and exists (
      select 1 from public.models m
      where m.id = banner_video.model_id and m.publish_state = 'published'
    )
    and (trim_id is null or app_auth.all_trims_published(array[trim_id]))
  );

-- model_versions and assets stay internal: the consumer surface is rendered server-side and is
-- handed finished URLs, so a browser never needs the registry or the studio's version history.

revoke insert, update, delete, truncate on public.model_versions from anon, authenticated;
revoke insert, update, delete, truncate on public.assets         from anon, authenticated;
revoke insert, update, delete, truncate on public.content_blocks from anon, authenticated;
revoke insert, update, delete, truncate on public.banner_video   from anon, authenticated;
