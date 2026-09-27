-- 20260927100000_assets_one_master_per_view.sql
-- The showroom asset standard (ADR 0022): ONE master per trim per view. Sizes, crops and mirroring
-- happen at render time; no variant is ever stored. So the registry holds at most one `render` or
-- `image` row per (trim, view_key), and at most one model-level row (no trim) per (model, view_key).
--
-- Per-colour renders are keyed by colour as well (assets_per_color_render_key, content migration)
-- and are not affected. Nor are documents, source models or videos.
--
-- Pre-check on the hosted DB before merging (must return 0 rows):
--   select trim_id, view_key, count(*) from public.assets
--    where kind in ('render', 'image') and trim_id is not null and view_key is not null
--    group by 1, 2 having count(*) > 1;
--   select model_id, view_key, count(*) from public.assets
--    where kind in ('render', 'image') and trim_id is null and model_id is not null and view_key is not null
--    group by 1, 2 having count(*) > 1;

create unique index assets_one_master_per_trim_view
  on public.assets (trim_id, view_key)
  where kind in ('render', 'image') and trim_id is not null and view_key is not null;

create unique index assets_one_master_per_model_view
  on public.assets (model_id, view_key)
  where kind in ('render', 'image') and trim_id is null and model_id is not null and view_key is not null;

comment on index public.assets_one_master_per_trim_view is
  'ADR 0022: one master per trim per view; sizes, crops and mirroring are render-time only.';
