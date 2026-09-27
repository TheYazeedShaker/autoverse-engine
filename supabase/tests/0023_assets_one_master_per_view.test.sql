-- 0023_assets_one_master_per_view.test.sql
-- Migration 20260927100000_assets_one_master_per_view.sql (ADR 0022).
-- Proves: a second `render`/`image` row for the same (trim, view) is refused, and so is a second
-- model-level row for the same (model, view). Different views and different trims are still allowed.
-- A replacement is an UPDATE of the one row (new public_path), not a second row. (Per-colour renders,
-- kind `per_color_render`, are outside both indexes by their `kind in ('render', 'image')` predicate.)
-- A violation RAISES EXCEPTION. Rolls back, so no fixture data persists.

begin;

create schema test_helpers;
create function test_helpers.try(stmt text) returns text language plpgsql as $$
begin
  execute stmt;
  return '';
exception when others then
  return sqlerrm;
end $$;

insert into public.brands (id, slug, name) values ('00000000-0000-0000-0000-00000000023a', 'brand-23', 'Brand 23');
insert into public.models (id, brand_id, slug, name_en, name_ar) values
  ('00000000-0000-0000-0000-0000000231a1', '00000000-0000-0000-0000-00000000023a', 'm', 'M', 'م');
insert into public.trims (id, brand_id, model_id, slug, name_en, name_ar) values
  ('00000000-0000-0000-0000-0000000232a1', '00000000-0000-0000-0000-00000000023a', '00000000-0000-0000-0000-0000000231a1', 't1', 'T1', 'ت'),
  ('00000000-0000-0000-0000-0000000232a2', '00000000-0000-0000-0000-00000000023a', '00000000-0000-0000-0000-0000000231a1', 't2', 'T2', 'ت');

insert into public.assets (brand_id, kind, storage_path, public_path, model_id, trim_id, view_key) values
  ('00000000-0000-0000-0000-00000000023a', 'render', 'm/t1-side.a1b2c3d4.png', 'b23/m/t1-side.a1b2c3d4.png',
   '00000000-0000-0000-0000-0000000231a1', '00000000-0000-0000-0000-0000000232a1', 'side'),
  ('00000000-0000-0000-0000-00000000023a', 'render', 'm/all-side.a1b2c3d4.png', 'b23/m/all-side.a1b2c3d4.png',
   '00000000-0000-0000-0000-0000000231a1', null, 'side');

do $$
declare msg text;
begin
  -- A second master for the same trim and view: refused (also when the second one is an `image`).
  msg := test_helpers.try($q$insert into public.assets (brand_id, kind, storage_path, public_path, model_id, trim_id, view_key)
    values ('00000000-0000-0000-0000-00000000023a', 'image', 'm/t1-side.ffffffff.png', 'b23/m/t1-side.ffffffff.png',
            '00000000-0000-0000-0000-0000000231a1', '00000000-0000-0000-0000-0000000232a1', 'side')$q$);
  if msg not like '%assets_one_master_per_trim_view%' then
    raise exception 'FAIL: a second master for the same (trim, view) was stored (%)', msg;
  end if;

  -- A second model-level master for the same view: refused.
  msg := test_helpers.try($q$insert into public.assets (brand_id, kind, storage_path, public_path, model_id, trim_id, view_key)
    values ('00000000-0000-0000-0000-00000000023a', 'render', 'm/all-side.ffffffff.png', 'b23/m/all-side.ffffffff.png',
            '00000000-0000-0000-0000-0000000231a1', null, 'side')$q$);
  if msg not like '%assets_one_master_per_model_view%' then
    raise exception 'FAIL: a second model-level master for the same view was stored (%)', msg;
  end if;

  -- Still allowed: another view of the same trim, the same view of another trim.
  msg := test_helpers.try($q$insert into public.assets (brand_id, kind, storage_path, public_path, model_id, trim_id, view_key)
    values ('00000000-0000-0000-0000-00000000023a', 'render', 'm/t1-front-34.a1b2c3d4.png', 'b23/m/t1-front-34.a1b2c3d4.png',
            '00000000-0000-0000-0000-0000000231a1', '00000000-0000-0000-0000-0000000232a1', 'front-34')$q$);
  if msg <> '' then raise exception 'FAIL: another view of the same trim was refused (%)', msg; end if;
  msg := test_helpers.try($q$insert into public.assets (brand_id, kind, storage_path, public_path, model_id, trim_id, view_key)
    values ('00000000-0000-0000-0000-00000000023a', 'render', 'm/t2-side.a1b2c3d4.png', 'b23/m/t2-side.a1b2c3d4.png',
            '00000000-0000-0000-0000-0000000231a1', '00000000-0000-0000-0000-0000000232a2', 'side')$q$);
  if msg <> '' then raise exception 'FAIL: the same view of another trim was refused (%)', msg; end if;

  -- A replacement is an update of the one row: a new content-hashed name.
  msg := test_helpers.try($q$update public.assets set public_path = 'b23/m/t1-side.99887766.png',
      storage_path = 'm/t1-side.99887766.png'
    where trim_id = '00000000-0000-0000-0000-0000000232a1' and view_key = 'side'$q$);
  if msg <> '' then raise exception 'FAIL: replacing a master in place was refused (%)', msg; end if;

  raise notice 'PASS: at most one master per (trim, view) and per model-level (model, view)';
end $$;

rollback;
