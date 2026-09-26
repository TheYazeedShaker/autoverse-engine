// Host → subdomain. The first step of resolving which brand-market a request is for (spec §2).
//
// `brand_markets.subdomain` is unique across brands, so one label identifies one brand-market. The
// root domain comes from config (`CONSUMER_ROOT_DOMAIN`), never from the request. Anything that
// isn't exactly `<one label>.<root>` resolves to nothing, and the page answers with a plain 404,
// so an unknown host learns nothing about which brands exist.

const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export function subdomainFromHost(
  host: string | null | undefined,
  rootDomain: string | null | undefined,
): string | null {
  if (!host || !rootDomain) return null;
  const root = rootDomain
    .trim()
    .toLowerCase()
    .replace(/^\.+|\.+$/g, "");
  if (!root) return null;
  // Strip the port, then any trailing dot (a fully qualified name is the same host).
  const name = host.trim().toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");
  const suffix = `.${root}`;
  if (!name.endsWith(suffix)) return null;
  const label = name.slice(0, -suffix.length);
  return LABEL.test(label) ? label : null;
}

// ---------------------------------------------------------------------------------------------
// The demo path on Vercel previews
// ---------------------------------------------------------------------------------------------
// A preview deployment is served at `<project>-<hash>-<team>.vercel.app` (and a per-branch alias),
// which names no brand. So a preview can be pointed at ONE brand-market by config:
// `SHOWROOM_PREVIEW_SUBDOMAIN=demo` in the Vercel project's Preview environment. It applies only
// when Vercel says the deployment is a preview, only to a `*.vercel.app` host, and never in
// production: a production host that doesn't resolve is still a 404. Which brand-market it shows
// grants nothing extra: the data is the same public, published catalogue the brand's own host
// serves, and the page_showroom flag still decides.

/** The configured preview brand-market, or null outside a Vercel preview or when unset/invalid. */
export function previewSubdomain(env: Record<string, string | undefined>): string | null {
  if (env.VERCEL_ENV !== "preview") return null;
  const value = env.SHOWROOM_PREVIEW_SUBDOMAIN?.trim() ?? "";
  return LABEL.test(value) ? value : null;
}

/** True for a Vercel-assigned `*.vercel.app` host (port ignored). */
export function isVercelPreviewHost(host: string | null | undefined): boolean {
  if (!host) return false;
  const name = host.trim().toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");
  return /^[a-z0-9-]+\.vercel\.app$/.test(name);
}
