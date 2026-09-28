# Runbook — showroom images: normalise, hash, upload, register

The standard is in ADR 0022:

- one master per trim per view, `side` and `front-34`;
- every side master faces **right**;
- content-hashed names `{brand}/{model}/{trim}-{view}.{hash8}.{ext}`;
- no stored variants.

The tool is `packages/asset-tools`, run on your machine. Hosted actions (the bucket, the SQL editor)
are yours.

## Before the first run: merge the constraint safely

Migration `20260927100000_assets_one_master_per_view` adds "at most one master per (trim, view)".
Run both queries on the hosted DB first. Each must return **0 rows**:

```sql
-- per (trim, view)
select trim_id, view_key, count(*) from public.assets
 where kind in ('render', 'image') and trim_id is not null and view_key is not null
 group by 1, 2 having count(*) > 1;
-- per model-level (model, view)
select model_id, view_key, count(*) from public.assets
 where kind in ('render', 'image') and trim_id is null and model_id is not null and view_key is not null
 group by 1, 2 having count(*) > 1;
```

## Re-normalising the demo masters (one-off, after #74 merges)

### 1. List the registered masters

In the SQL editor:

```sql
select a.public_path
  from public.assets a join public.brands b on b.id = a.brand_id
 where b.slug = 'demo' and a.kind in ('render', 'image') and a.public_path is not null
 order by 1;
```

Copy the `public_path` column into a text file, one key per line, e.g. `C:\showroom\keys.txt`.

### 2. Download them, bypassing the caches

From the repo root:

```bash
node packages/asset-tools/src/download.mjs --base <ASSET_BASE_URL> --keys C:/showroom/keys.txt --out C:/showroom/masters
```

This writes `C:\showroom\masters\demo\<model>\<file>`. It adds a cache-busting query string, so a
file replaced under the same name comes back as the **new** copy.

**Check the folder by eye:**

- There should be one file per trim per view, 14 in all.
- If a master exists in the bucket but isn't registered, copy it in by hand as
  `masters\demo\<model>\<trim>-<view>.png`. That could be the newly uploaded Vistiq side, if it
  went up under a new name.
- Remove any older duplicate for the same trim and view.

### 3. Normalise

```bash
node packages/asset-tools/src/normalize.mjs --in C:/showroom/masters/demo --out C:/showroom/normalized --brand demo
```

`--out` must be a **new or empty** folder. The tool refuses otherwise, so an upload never carries a
file left over from an older run. Delete `C:\showroom\normalized` before each re-run.

Read `C:\showroom\normalized\report.txt`:

- **ERR … faces LEFT**: that side master reads as the wrong way round. Open it:
  - if it really faces left, replace it with a right-facing master (never mirror at render time)
    and re-run;
  - if it faces right by eye (the check is a heuristic and can misread a pickup or a long-tailed
    coupé), re-run with `--confirm-right <model>/<file>` (comma-separated for several), e.g.
    `--confirm-right vistiq/luxury-side.png`.
  - No `register.sql` is written while any error remains.
- **ERR … not transparent / no alpha channel**: the master has a background. Get a transparent PNG.
- **WARN … probably faces LEFT** or **too close to call**: open that file and confirm the car faces
  right. If it does, carry on.
- **WARN … enlarged**: the source is narrower than 1920 px. It works, but a larger master is sharper.
- **OK** lines show each output name, e.g.
  `demo/lyriq/signature-luxury-side.3f9a1c07.png (1920×702)`.

### 4. Upload, register, then remove the old files

This order keeps the page working throughout:

1. **Upload.** Storage → `showroom-public` → open the `demo` folder → **Upload**, then drag in the
   _contents_ of `C:\showroom\normalized\demo`, i.e. the model folders, so the paths stay
   `demo/<model>/…`. The new hashed names sit beside the old ones; nothing is overwritten.
2. **Register.** Run `C:\showroom\normalized\register.sql` in the SQL editor. Its final query lists
   one row per trim per view, each with its hashed `public_path` and its size.
3. **Confirm, then wait.** Open the preview and check the new images show: every car faces right,
   and the image URLs end in `.<hash8>.png`. Then **wait at least a few minutes, ideally a few hours**,
   before deleting anything. Pages rendered in the last 60 s (the catalogue cache, ADR 0017), and
   tabs already open, still point at the old URLs until they reload.
4. **Remove the old objects.** Run the orphan query below (scoped to `demo/`). It lists the objects
   under `demo/` that no row points at: the old unhashed files. **Review the list**, then delete
   those files in Storage.
   - Never delete a `.emptyFolderPlaceholder` object: Supabase uses it to keep a folder visible.
     The orphan query already leaves it out.
   - That is the same end state as "empty the demo folder, then upload", reached without ever
     pointing a live page at a missing file.

### 5. Check

Run both queries below. Both must return **0 rows**. Then open the preview: every car faces right,
every card's car is the same size on the same ground line, and a new image appears as soon as the
catalogue cache turns over (at most 60 s; ADR 0017).

## The check queries

Registered masters with **no object** in the bucket (the page would show a broken image):

```sql
select b.slug as brand, a.view_key, a.public_path
  from public.assets a
  join public.brands b on b.id = a.brand_id
  left join storage.objects o on o.bucket_id = 'showroom-public' and o.name = a.public_path
 where a.public_path is not null and o.id is null
 order by 1, 3;
```

Objects under **one brand's folder** that **no row points at** (old versions, strays). Always
scope it to the brand you're working on: another brand's upload still in progress would otherwise
show up too. Review the list before deleting anything.

```sql
select o.name, o.created_at
  from storage.objects o
  left join public.assets a on a.public_path = o.name
 where o.bucket_id = 'showroom-public' and o.name like 'demo/%' and a.id is null
   and o.name not like '%/.emptyFolderPlaceholder'
   -- Logos are referenced by the theme, not the asset registry (ADR 0024).
   and not exists (select 1 from public.brand_themes t
                    where o.name in (t.logo_light_asset_ref, t.logo_dark_asset_ref))
 order by 1;
```

## Replacing one master later

Put the new file in a folder as `<model>/<trim>-<view>.png`, run `normalize.mjs` on that folder,
upload the one output file, and run its `register.sql`. The row is updated in place with the new
hashed name. Confirm it shows on the preview, wait a while (step 4, point 3), then run the
orphan query for that brand and delete the old object.

**Never** upload a new version under an existing name.

## Brand logos (ADR 0024)

A logo is `{brand}/_brand/logo-{light|dark}.{hash8}.{svg|png}` in `showroom-public`:

- **light** is the light-coloured mark, for dark surfaces. The TopBar uses it.
- **dark** is the dark mark, for light surfaces.
- SVG or PNG only. The page shows it with `<img>`. With no logo, it shows the brand name.

### Upload and register a logo

1. **Get the files.** An SVG must be plain: shapes and paths only, with no script, links, embedded
   images or fonts loaded from elsewhere. A PNG must have a transparent background.
2. **Prepare them.** From the repo root:

   ```bash
   node packages/asset-tools/src/logo-cli.mjs --brand demo --out C:/showroom/logo --light C:/showroom/demo-logo-light.svg --dark C:/showroom/demo-logo-dark.svg
   ```

   - Either `--light` or `--dark` alone is fine.
   - `--out` must be a new or empty folder.
   - It prints `OK light: … → demo/_brand/logo-light.<hash8>.svg`. An `ERR` line says what to fix, and
     no SQL is written until every file passes.

3. **Upload.** Storage → `showroom-public` → open the `demo` folder → **Upload**. Drag in the `_brand`
   folder from `C:\showroom\logo\demo`, so the key is `demo/_brand/logo-light.<hash8>.svg`.
4. **Register.** Run `C:\showroom\logo\register-logo.sql` in the SQL editor. It sets the logo on every
   market theme of the brand, and its last query shows the keys.
5. **Check.** Open the preview: the TopBar shows the logo instead of the brand name.
   - It appears once the catalogue cache turns over (at most 60 s; ADR 0017).
   - If the name still shows, check that the object key in Storage matches the registered key exactly.
6. **A new version later:** repeat steps 2–5. The new file gets a new name, and the theme is updated
   to it. After confirming, delete the old object (the orphan query lists it).

To remove a logo, set the column to null:

```sql
update public.brand_themes set logo_light_asset_ref = null
 where brand_id = (select id from public.brands where slug = 'demo');
```

Then delete the object.

- **Renaming a brand's slug** is refused while its themes have logos (`brand_slug_has_logos`).
  1. Clear the logos (the query above).
  2. Rename the slug.
  3. Re-run steps 2–4 with the new slug.
  4. Delete the old objects.
