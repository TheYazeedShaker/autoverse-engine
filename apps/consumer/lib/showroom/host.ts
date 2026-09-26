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
