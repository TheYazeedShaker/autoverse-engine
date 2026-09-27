# 0022 — the showroom asset standard: one right-facing, content-hashed master per trim per view

**Status:** accepted — 2026-09-27 (owner)

## Context

On the first real preview, two things went wrong:

- **A replaced image stayed stale.** The Lyriq side master in the bucket was replaced with a
  right-facing version under the **same name**. The public URL showed the new file in a fresh
  browser, but the page kept showing the old one.
  - The code does **not** flip any model: the only mirroring in the code is the Arabic (RTL)
    mirror.
  - The old copy was being served from caches: the storage CDN (`max-age=3600`) and Next's image
    optimiser (ADR 0020).
- **Cars rendered at different sizes.** Each master had different transparent margins and a
  different width, so on the page the cars came out at different sizes and stood on different
  ground lines.

## Decision

1. **One master per trim per view.** `side` feeds the cards and the spec drawer; `front-34` feeds
   the hero. **No stored variants:** sizes (next/image `srcset`), crops and mirroring all happen at
   render time.
   - Enforced in the database: the partial unique indexes `assets_one_master_per_trim_view` and
     `assets_one_master_per_model_view` (migration `20260927100000`, test 0023) allow at most one
     `render`/`image` row per (trim, view), and per model-level (model, view).
   - Replacing a master **updates** that row with a new `public_path`.
2. **Canonical direction: every side master faces RIGHT**, with the front of the car at the right
   edge.
   - The **only** mirroring anywhere is the page-level RTL mirror (`rtl:-scale-x-100` on
     `CarImageFrame`), which turns the car to face the reading direction in Arabic.
   - `packages/ui/src/car-direction.test.ts` fails the build if any other horizontal mirror appears
     in `@autoverse/ui` or the consumer app. That catches a per-model flip like the prototype's.
3. **Content-hashed object names:** `{brand}/{model}/{trim}-{view}.{hash8}.{ext}`, where `hash8`
   is the first 8 hex digits of the SHA-256 of the file's bytes.
   - A new version is a **new URL**, so no cache (browser, CDN or optimiser) can ever serve an old
     copy under a current name.
   - **An object name is never reused.**
4. **Normalised masters.** Each master is trimmed tight to the car's bounding box (transparent
   margins removed), then scaled to one standard width per view (1920 px for both). Side masters
   are checked for direction.
   - The tool is `packages/asset-tools` (`normalize.mjs`), run locally by the owner. It writes the
     hashed files plus a re-runnable `register.sql` (with width and height).
   - The direction check is a heuristic: on a side view the bonnet end of the roofline sits lower
     than the tail end. It has four readings:
     - `right`: passes;
     - a strong `left`: an **error**;
     - a weak `left`: a **warning**;
     - too close to call: a **warning**.
       A pickup or a long-tailed coupé can misread, so a master checked by eye can be accepted with
       `--confirm-right <model/file>`, which turns that error into a warning. It never passes a
       doubtful master silently.
   - An opaque (non-transparent) master is an **error**. The bounding box ignores alpha ≤ 16, so a
     faint baked-in shadow can't make one car's box bigger than another's.
   - `storage_path` is required on `assets`. Hand-registered masters have no private-store copy
     (1·B creates those), so on **insert** `register.sql` records `masters/` + the public name as a
     demo-only convention; on **update** it leaves `storage_path` unchanged. 1·B will write real
     private-store paths.
5. **Every car renders in a fixed box per view.** `CarImageFrame` has a 2:1 box for `side` (the
   same box on every card and, from slice 5, in the drawer) and 16:9 for `front-34` (the hero).
   - The image fills the box width with `object-contain` and bottom alignment, so every car appears
     the same size and stands on the same ground line.
   - The placeholder for a missing image takes the same box, so the layout never jumps.
   - **Amendment (owner, 2026-09-28):** in the `side` box the car fills **80%** of the box width,
     centred and still bottom-aligned; the box keeps its size. The 80% is one token,
     `carFrame.sideFill` / `--av-car-fill-side` (TS↔CSS parity tested), never a literal. The hero's
     framing (`front-34`, still the full box) is set in slice 4.
   - On the card, the box bleeds past the content column by exactly the card's padding, so it spans
     the card's full inner width (edge to border) and never overflows it. The placeholder is inset
     by the same padding, so it lines up with the content.

## Consequences

- **The render pipeline (1·B) must respect the one-master rule.** The indexes key on (trim, view) and
  (model, view) and ignore `model_version_id`, so a pipeline that writes one `render` row per model
  version would be refused. When a new version is rendered it **updates** the one row (a new hashed
  `public_path`); version history belongs in `model_versions` and the private store, not in extra
  public rows.

- **Taking an image down** still follows ADR 0018/0020: delete the object, clear or replace the row,
  purge the CDN and the optimiser. Hashing means a _replacement_ no longer needs a purge to show up.
  A _take-down_ does, because the old URL stays cached until it expires.
- With immutable keys, the optimiser's `minimumCacheTTL` (1 day, ADR 0020) can be raised later.
  That is left as it is until 1·B scripts the take-down purge.
- **The object key format isn't enforced in the database yet.** The tool and the runbook enforce it.
  A CHECK on `public_path` can follow once every row is hashed (a hosted pre-check first).
- **Runbook:** `docs/runbooks/showroom-assets.md` covers the migration steps, the registry-vs-bucket
  check query, and how to replace a master.
