# 0024 — brand logos: hashed public-bucket keys, light and dark, rendered as <img>

**Status:** accepted — 2026-09-28 (owner, `#build-decisions`)

## Context

`brand_themes` has had `logo_light_asset_ref` and `logo_dark_asset_ref` since the theming migration,
but nothing defined what they held (an asset id? a path?). So the TopBar (spec §5.2) showed the brand
name as a wordmark instead of guessing.

## Decision

1. **A logo is a public-bucket object key under the asset standard (ADR 0022):**
   `{brand}/_brand/logo-{light|dark}.{hash8}.{svg|png}`.
   - It is content-hashed and a name is never reused, so a new logo is a new URL.
   - `_brand` can't collide with a model folder, because model slugs are `[a-z0-9-]` only.
2. **Two variants, named by the surface they go on** (owner decision B, `#build-decisions`,
   2026-09-28; this matches the theming REV and the admin Theme tab's "Logo · light surfaces" /
   "Logo · dark surfaces"):
   - `logo_light_asset_ref` is the logo **for light surfaces**, so a dark-coloured mark. Nothing uses
     it yet; a light footer (§5.11) may.
   - `logo_dark_asset_ref` is the logo **for dark surfaces**, so a light or white mark. **The dark
     TopBar uses it.**
   - The tool warns when a logo barely stands out on its surface: the average colour of its visible
     pixels has less than 3:1 contrast (WCAG 1.4.11) against Mist for light surfaces or Gunmetal for
     dark. That catches, for example, a white mark registered as `light`. It's a warning, not an
     error: check by eye.
3. **SVG or PNG only, rendered with `<img>`, never inline SVG.** An `<img>` can't run a logo's script
   in the page.
   - An SVG opened directly at its bucket URL would run script, so the owner's tool (`logo-cli.mjs`)
     refuses SVGs with script, event handlers, `javascript:` URLs, `<foreignObject>`, external
     references, entities or CSS URLs.
   - A PNG must have transparency.
4. **Fallback: the brand name.** The wordmark shows when there is no logo, no `ASSET_BASE_URL`, or a
   ref the page doesn't trust.
5. **Enforced in three places.**
   - **Database** (migration `20260928100000`, test 0024):
     - a CHECK per variant (format, extension, variant name);
     - a trigger requiring the key's brand folder to be the row's own brand, so one brand's theme can
       never point at another brand's files.
   - **Consumer:** `logoPath()` re-checks the format and the brand, and logs `showroom_logo_invalid`
     when it drops a ref.
   - **Tool:** `packages/asset-tools/src/logo-cli.mjs` checks the file, hashes the name and writes the
     re-runnable SQL.

## Consequences

- **A brand's slug can't be renamed while its themes have logos** (a trigger on `brands`; security
  review). The old folder could later belong to another brand. Clear the logos, rename, then
  re-register them under the new slug (runbook).
- **Residual risk (security review): the SVG check is a blocklist.**
  - It refuses the known script vectors, including animation elements and character references.
  - An SVG only runs script when opened directly at its URL, and then on the storage origin, never
    the app's: the page's `<img>` never runs it, and no app session lives on the storage domain.
  - Hardening, owner side: restrict the bucket's allowed MIME types to `image/svg+xml`, `image/png`
    and `image/webp`, and check the served headers (`curl -I` on a `.svg`).
  - Stronger options, if needed later: an allowlist sanitiser (e.g. SVGO with a strict element and
    attribute allowlist), or PNG only.
- The logo is not optimised by `next/image`, which refuses SVG by default. Logos are small, and the
  bucket CDN caches them.
- `favicon_asset_ref` is still undefined. It gets the same treatment when the favicon is built.
- **Runbook:** `docs/runbooks/showroom-assets.md`, section _Brand logos_.
