// Image URLs for the showroom (images decision, #build-decisions 2026-09-26; ADR 0020).
//
// A registry row's `public_path` is an object key in the PUBLIC published bucket (ADR 0018), and
// `ASSET_BASE_URL` is that bucket's public base, e.g.
// https://<project>.supabase.co/storage/v1/object/public/showroom-public/
// The page joins the two and hands the result to next/image, which resizes and serves the `srcset`
// (next.config.js allows exactly this base as its one remote pattern).
//
// Defence in depth: the key has already passed the database CHECK and the Zod schema, and here the
// joined URL must still sit under the configured base. A key can never point the page anywhere else.

/** The configured base, normalised to end in "/", or null when unset or not an http(s) URL. */
export function assetBase(raw: string | undefined): URL | null {
  if (!raw) return null;
  try {
    const url = new URL(raw.endsWith("/") ? raw : `${raw}/`);
    // Same rules next.config.js enforces at build: https, no query, one bucket's prefix (not the root).
    if (url.protocol !== "https:" || url.search || url.hash || url.pathname === "/") return null;
    return url;
  } catch {
    return null;
  }
}

/** The public URL of an object key, or null if it would leave the base. */
export function assetUrl(publicPath: string, base: URL | null): string | null {
  if (!base) return null;
  if (
    !/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(publicPath) ||
    /(^|\/)\.\.(\/|$)/.test(publicPath) ||
    publicPath.includes("//")
  ) {
    return null;
  }
  const url = new URL(publicPath, base);
  return url.origin === base.origin && url.pathname.startsWith(base.pathname) ? url.href : null;
}
