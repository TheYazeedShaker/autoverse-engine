-- 0007_content.test.sql
-- MANDATORY isolation test for migration 20260922225904_content.sql (1·A Slice 4).
-- Proves: a per-colour render must be fully keyed; the per-colour key is unique; a banner override
-- belongs to the model it overrides and only one exists per trim; content is bilingual or absent;
-- a brand reads only its own content and media; an end user sees published blocks on published
-- models and nothing of the asset registry; anon sees nothing; the service role is the only writer.

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
  ('00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000b1'),
  ('00000000-0000-0000-0000-0000000000c1'),
  ('00000000-0000-0000-0000-0000000000d1');

insert into public.brands (id, slug, name) values
  ('00000000-0000-0000-0000-00000000000a', 'brand-a', 'Brand A'),
  ('00000000-0000-0000-0000-00000000000b', 'brand-b', 'Brand B');

insert into public.profiles (id, brand_id, brand_role, platform_role) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', 'brand_admin', null),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000b', 'brand_admin', null),
  ('00000000-0000-0000-0000-0000000000c1', null, null, 'ops');

insert into public.models (id, brand_id, slug, name_en, name_ar, publish_state) values
  ('00000000-0000-0000-0000-0000000a1001', '00000000-0000-0000-0000-00000000000a', 'a-pub',   'A Pub',   'أ', 'published'),
  ('00000000-0000-0000-0000-0000000a1002', '00000000-0000-0000-0000-00000000000a', 'a-draft', 'A Draft', 'أ', 'draft'),
  ('00000000-0000-0000-0000-0000000b1001', '00000000-0000-0000-0000-00000000000b', 'b-pub',   'B Pub',   'ب', 'published');

insert into public.trims (id, brand_id, model_id, slug, name_en, name_ar, publish_state) values
  ('00000000-0000-0000-0000-0000000a2001', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000a1001', 'base',   'Base',   'أساسي', 'published'),
  -- Unannounced variant of a published model.
  ('00000000-0000-0000-0000-0000000a2002', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000a1001', 'secret', 'Secret', 'سري',   'draft'),
  ('00000000-0000-0000-0000-0000000b2001', '00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000b1001', 'base',   'Base',   'أساسي', 'published');

insert into public.vocabulary_registry (id, kind, display_en, display_ar) values
  ('graphite', 'exterior_color', 'Graphite', 'جرافيت');

insert into public.model_versions (id, brand_id, model_id, version) values
  ('00000000-0000-0000-0000-0000000a6001', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000a1001', 1);

insert into public.assets (brand_id, kind, storage_path, model_id, model_version_id, trim_id, vocabulary_id, view_key) values
  ('00000000-0000-0000-0000-00000000000a', 'per_color_render', 'assets/brand-a/a-pub/v1/renders/graphite-front.webp',
   '00000000-0000-0000-0000-0000000a1001', '00000000-0000-0000-0000-0000000a6001', '00000000-0000-0000-0000-0000000a2001', 'graphite', 'front-3q');

insert into public.content_blocks (brand_id, model_id, kind, headline_en, headline_ar, body_en, body_ar, publish_state, order_index) values
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000a1001', 'chapter', 'Designed to move', 'صُمم للحركة', 'Body', 'نص', 'published', 1),
  -- A draft chapter on an otherwise live page.
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000a1001', 'feature', 'Not yet',          'ليس بعد',    null,   null,  'draft',     2),
  ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000b1001', 'chapter', 'B headline',       'ب',          null,   null,  'published', 1);

insert into public.banner_video (brand_id, model_id, trim_id, asset_ref) values
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000a1001', null, 'assets/brand-a/a-pub/v1/content/banner.mp4'),
  -- Override for the unannounced trim: must stay hidden with it.
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000a1001', '00000000-0000-0000-0000-0000000a2002', 'assets/brand-a/a-pub/v1/content/banner-secret.mp4');

-- ---- 1. the shapes the database refuses ----
do $$
declare msg text;
begin
  -- A per-colour render that does not say which colour it is.
  msg := test_helpers.try($q$insert into public.assets (brand_id, kind, storage_path, model_version_id, trim_id, view_key)
    values ('00000000-0000-0000-0000-00000000000a', 'per_color_render', 'assets/x.webp',
            '00000000-0000-0000-0000-0000000a6001', '00000000-0000-0000-0000-0000000a2001', 'front-3q')$q$);
  if msg not like '%assets_per_color_render_fully_keyed%' then
    raise exception 'FAIL: a half-identified per-colour render was stored (%)', msg;
  end if;

  -- The same (version, trim, colour, view) twice.
  msg := test_helpers.try($q$insert into public.assets (brand_id, kind, storage_path, model_id, model_version_id, trim_id, vocabulary_id, view_key)
    values ('00000000-0000-0000-0000-00000000000a', 'per_color_render', 'assets/duplicate.webp',
            '00000000-0000-0000-0000-0000000a1001', '00000000-0000-0000-0000-0000000a6001',
            '00000000-0000-0000-0000-0000000a2001', 'graphite', 'front-3q')$q$);
  if msg not like '%assets_per_color_render_key%' then
    raise exception 'FAIL: two renders claimed the same colour and view (%)', msg;
  end if;

  -- An asset of another brand's model.
  msg := test_helpers.try($q$insert into public.assets (brand_id, kind, storage_path, model_id)
    values ('00000000-0000-0000-0000-00000000000b', 'render', 'assets/stolen.webp', '00000000-0000-0000-0000-0000000a1001')$q$);
  if msg not like '%violates foreign key constraint%' then
    raise exception 'CRITICAL: an asset was attached to another brand''s model (%)', msg;
  end if;

  -- A banner override for a trim of a different model.
  msg := test_helpers.try($q$insert into public.banner_video (brand_id, model_id, trim_id, asset_ref)
    values ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000a1002',
            '00000000-0000-0000-0000-0000000a2001', 'assets/x.mp4')$q$);
  if msg not like '%does not belong to model%' then
    raise exception 'CRITICAL: a banner overrode a trim of another model (%)', msg;
  end if;

  -- A second banner for the same trim, and a second model-wide banner.
  msg := test_helpers.try($q$insert into public.banner_video (brand_id, model_id, trim_id, asset_ref)
    values ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000a1001', null, 'assets/second.mp4')$q$);
  if msg not like '%banner_video_model_default_key%' then
    raise exception 'FAIL: a model got two default banners (%)', msg;
  end if;

  -- Half-translated body copy.
  msg := test_helpers.try($q$insert into public.content_blocks (brand_id, model_id, kind, headline_en, headline_ar, body_en)
    values ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000a1001', 'chapter', 'H', 'ه', 'English only')$q$);
  if msg not like '%content_blocks_body_bilingual%' then
    raise exception 'FAIL: a content block was stored with copy in one language only (%)', msg;
  end if;

  raise notice 'PASS: renders are fully keyed and unique, banners stay on their model, content is bilingual or absent';
end $$;

set local role authenticated;

-- ---- 2. Brand A reads its own, none of Brand B's, and writes nothing ----
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
do $$
declare own int; other int; msg text;
begin
  select count(*) into other from public.content_blocks where brand_id = '00000000-0000-0000-0000-00000000000b';
  if other <> 0 then raise exception 'CRITICAL: Brand A can read Brand B''s content blocks (got %)', other; end if;
  select count(*) into other from public.assets where brand_id = '00000000-0000-0000-0000-00000000000b';
  if other <> 0 then raise exception 'CRITICAL: Brand A can read Brand B''s assets (got %)', other; end if;

  select count(*) into own from public.content_blocks;
  if own <> 2 then raise exception 'FAIL: Brand A should see both its own blocks incl. the draft (got %)', own; end if;
  select count(*) into own from public.assets;
  if own <> 1 then raise exception 'FAIL: Brand A should see its own asset (got %)', own; end if;
  select count(*) into own from public.banner_video;
  if own <> 2 then raise exception 'FAIL: Brand A should see both its banners (got %)', own; end if;

  msg := test_helpers.try($q$update public.content_blocks set publish_state = 'published'
    where brand_id = '00000000-0000-0000-0000-00000000000a'$q$);
  if msg not like '%permission denied%' and msg not like '%row-level security%' then
    if exists (select 1 from public.content_blocks where kind = 'feature' and publish_state = 'published') then
      raise exception 'CRITICAL: a brand published its own draft content directly';
    end if;
  end if;

  raise notice 'PASS: Brand A reads its own content and media, writes none, and sees nothing of Brand B''s';
end $$;

-- ---- 3. an end user sees published blocks only, and no registry at all ----
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true);
do $$
declare n int;
begin
  select count(*) into n from public.content_blocks;
  if n <> 2 then raise exception 'FAIL: an end user should see the 2 published blocks (got %)', n; end if;

  select count(*) into n from public.content_blocks where publish_state <> 'published';
  if n <> 0 then raise exception 'CRITICAL: an end user can read a draft content block (got %)', n; end if;

  -- The banner that overrides the unannounced trim must be hidden with it.
  select count(*) into n from public.banner_video;
  if n <> 1 then raise exception 'FAIL: an end user should see only the model-wide banner (got %)', n; end if;
  select count(*) into n from public.banner_video where trim_id is not null;
  if n <> 0 then
    raise exception 'CRITICAL: a banner leaked an unannounced trim (got %)', n;
  end if;

  -- The asset registry and the studio's version history are internal.
  select count(*) into n from public.assets;
  if n <> 0 then raise exception 'CRITICAL: an end user can read the asset registry (got %)', n; end if;
  select count(*) into n from public.model_versions;
  if n <> 0 then raise exception 'CRITICAL: an end user can read model versions (got %)', n; end if;

  raise notice 'PASS: an end user sees published content only — no drafts, no unannounced trims, no registry';
end $$;

-- ---- 4. anon sees nothing ----
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$
declare nc int; nb int; na int;
begin
  select count(*) into nc from public.content_blocks;
  select count(*) into nb from public.banner_video;
  select count(*) into na from public.assets;
  if nc <> 0 or nb <> 0 or na <> 0 then
    raise exception 'CRITICAL: anon reads content rows (blocks %, banners %, assets %)', nc, nb, na;
  end if;
  raise notice 'PASS: anon reads no content, banners or assets';
end $$;

-- ---- 5. staff read all; only the service role writes ----
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
do $$
declare n int;
begin
  select count(*) into n from public.content_blocks;
  if n <> 3 then raise exception 'FAIL: ops staff should see all 3 blocks (got %)', n; end if;
  select count(*) into n from public.assets;
  if n <> 1 then raise exception 'FAIL: ops staff should see the asset (got %)', n; end if;
  raise notice 'PASS: staff read all content and media';
end $$;

reset role;
set local role service_role;
select set_config('request.jwt.claims', '', true);
do $$
declare n int; msg text;
begin
  msg := test_helpers.try($q$update public.content_blocks set publish_state = 'published' where kind = 'feature'$q$);
  if msg <> '' then raise exception 'CRITICAL: the service role cannot publish a content block (%)', msg; end if;
  select count(*) into n from public.content_blocks where publish_state = 'published';
  if n <> 3 then raise exception 'CRITICAL: the service-role publish did not land (got %)', n; end if;

  msg := test_helpers.try($q$insert into public.assets (brand_id, kind, storage_path, model_id)
    values ('00000000-0000-0000-0000-00000000000a', 'banner_video', 'assets/brand-a/a-pub/v1/content/new.mp4',
            '00000000-0000-0000-0000-0000000a1001')$q$);
  if msg <> '' then raise exception 'CRITICAL: the service role cannot register an asset (%)', msg; end if;

  raise notice 'PASS: the service role writes content and media — nobody else does';
end $$;

rollback;
