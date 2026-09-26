# 0020 — showroom images: a public published bucket, a base URL, next/image

**Status:** accepted — 2026-09-26 (owner, `#build-decisions`, images decision: option A with one
condition)

## Context

Spec §3 maps the card image to the asset registry's `side` view and the hero to `front-34`, and
§5.3 wants `srcset` at 960/1440/1920. The architecture documents only say "content-hashed
immutable paths… CDN-cached". Nothing named a bucket, a base URL, or public vs signed URLs.

## Decision

- **A public-read bucket behind the CDN**, `showroom-public` (Supabase Storage). Its public base is
  the Vercel variable **`ASSET_BASE_URL`**, e.g.
  `https://<project>.supabase.co/storage/v1/object/public/showroom-public/`.
- **The page builds an image URL as `ASSET_BASE_URL` + `assets.public_path`**
  (`apps/consumer/lib/showroom/images.ts`). A key that would leave the base (traversal, an
  absolute path or URL) gives no URL, on top of the database CHECK (ADR 0018) and the Zod schema.
- **`next/image` resizes and serves the `srcset`.** `next.config.js` allows exactly one remote
  pattern, derived from `ASSET_BASE_URL` at build time (so the variable is in `env` in
  `apps/consumer/turbo.json`). Device sizes are 640/960/1440/1920, formats AVIF/WebP.
- **No base configured** (or a card with no public image): the card shows its designed placeholder,
  and the page logs `showroom_asset_base_missing` (or the loader logs `showroom_asset_missing`).
  An image is never broken.

**The owner's condition: the public bucket holds published renders only.** Drafts and pre-launch
renders live in a private bucket and are copied into the public one at publish. Brands launch
models under embargo, so an unpublished render must never be fetchable, even by a guessed path.
This is enforced by `public_path` (ADR 0018): only a row with a public copy is ever returned to the
page, and unpublish must delete the object (the ADR 0018 requirement on the publish step).

## Caching

- The storage CDN serves the objects. The publish step (1·B) should set long, immutable cache
  headers once keys are content-hashed.
- **Next's image optimiser keeps its own copy** (`minimumCacheTTL`, one day for now). That is one
  more cache a take-down has to wait out or purge, so it stays short until 1·B makes keys
  content-hashed and immutable. A take-down must then also purge the optimised copies (Vercel's
  image cache), in addition to the requirements in ADR 0018.
- The optimiser keeps its copy for the **longer** of `minimumCacheTTL` and the upstream
  `Cache-Control` max-age. Once 1·B sets long immutable headers, an unpublished image stays in
  the optimiser's cache for that long unless it is purged. A take-down is therefore only complete
  when that cache is purged as well.
- The demo's object keys (`demo/<model>/<trim>-<view>.png`, uploaded by hand per the runbook) are
  **not** content-hashed. Replace a demo image under a **new** key rather than overwriting in place.
  Predictable keys are acceptable only because demo data is never under embargo.

## Requirements on the publish step (1·B), in addition to ADR 0018's

- Copy a render into `showroom-public` **only at the moment of publish**, never ahead of an embargo
  date.
- Use **unguessable, content-hashed** keys under a brand prefix.
- `storage.objects` has **no SELECT or list policy** for `showroom-public`. A public bucket lets
  anyone download by URL, but listing still goes through RLS, and a list policy would expose every
  key.
- Unpublish deletes the object, purges the storage CDN, and purges Vercel's optimised copies.
  These are **scripted steps with a check** (the object URL and its `/_next/image` URL both stop
  serving), never manual ones.

## Build-time safety

`next.config.js` refuses to build unless `ASSET_BASE_URL` is an https URL of one bucket's prefix,
with no query and not the host root. A bare host would turn `/_next/image` into a proxy for every
path on it. `assetBase()` applies the same rules at runtime.

## Consequences

- `ASSET_BASE_URL` must be set in Preview and Production (it's read at build time, so redeploy
  after changing it).
- Every other remote image host is refused by next/image; adding a CDN host is a config change
  plus an amendment here.
- Per-colour renders stay out of the showroom card (ADR 0018); colour belongs to the configurator.
