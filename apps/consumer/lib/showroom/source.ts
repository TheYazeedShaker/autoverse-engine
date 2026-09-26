import { ShowroomCatalog, type CatalogSnapshot } from "./catalog-schema";

// The seam between the showroom and the database.
//
// In production and on previews the catalogue comes from `public.showroom_catalog` (ADR 0018),
// called with the ANON key: the only path an anonymous visitor's page has to catalogue data. The
// service-role key never reaches this app (production plan §3.1). Locally, `SHOWROOM_SOURCE=fixture`
// serves the demo fixture instead, and it can never switch on in a deployed build.

export type { CatalogSnapshot } from "./catalog-schema";

export interface CatalogSource {
  /**
   * The brand-market a subdomain names, with its catalogue. Null when there is none. The signal
   * aborts on the caller's timeout; the trace id goes to the database gateway as `x-request-id`.
   */
  load(subdomain: string, signal?: AbortSignal, traceId?: string): Promise<CatalogSnapshot | null>;
}

/**
 * The HARD limit on how old a served catalogue can be (ADR 0017, amended). A publish, an unpublish
 * or a brand-market going off live reaches every page within this.
 *
 * It is enforced by our own cache (withHardTtlCache), not Next's data cache. Next serves an
 * expired entry once more while it refreshes in the background (stale-while-revalidate), so after
 * a quiet spell the first visitor would see a snapshot of any age. For an embargoed launch that
 * could show an unpublished model to a real visitor.
 */
export const CATALOG_TTL_SECONDS = 60;
/** Distinct subdomains kept per server instance. Only flag-enabled subdomains ever reach it. */
export const CATALOG_CACHE_MAX_ENTRIES = 200;

/**
 * Wraps a source in a per-instance cache with a hard expiry. An entry older than the TTL is never
 * served: it is dropped, and the read goes to the source. A null answer ("no such brand-market")
 * is cached too, so a missing seed shows within the same window once fixed. Errors are never
 * cached. When full, the oldest entry is evicted.
 */
export function withHardTtlCache(
  source: CatalogSource,
  opts: {
    ttlMs?: number;
    maxEntries?: number;
    now?: () => number;
    store?: Map<string, { at: number; value: CatalogSnapshot | null }>;
  } = {},
): CatalogSource {
  const ttlMs = opts.ttlMs ?? CATALOG_TTL_SECONDS * 1000;
  const maxEntries = opts.maxEntries ?? CATALOG_CACHE_MAX_ENTRIES;
  const now = opts.now ?? Date.now;
  const store = opts.store ?? new Map();
  return {
    async load(subdomain, signal, traceId) {
      const hit = store.get(subdomain);
      if (hit && now() - hit.at < ttlMs) return hit.value;
      store.delete(subdomain);
      // Stamped with when the read STARTED: the data can be no older than that. An older read
      // finishing late never overwrites a newer one, so the 60 s bound holds exactly.
      const startedAt = now();
      const value = await source.load(subdomain, signal, traceId);
      const current = store.get(subdomain);
      if (current && current.at > startedAt) return value;
      if (!current && store.size >= maxEntries) {
        const oldest = store.keys().next();
        if (!oldest.done) store.delete(oldest.value);
      }
      store.set(subdomain, { at: startedAt, value });
      return value;
    },
  };
}

// One cache per server instance, shared by every request that instance serves.
const instanceCache = new Map<string, { at: number; value: CatalogSnapshot | null }>();

/** Diagnostic fields an error adds to its `showroom_source_error` log line. Never values or PII. */
export interface LoggableError {
  logFields(): Record<string, unknown>;
  /** False for failures a second attempt can't fix (a contract break, a 4xx). */
  readonly retryable: boolean;
}

/**
 * Thrown when the function's payload doesn't match the schema: a contract break, not a miss.
 * Carries the failing schema paths and issue codes, which name our own keys and never the
 * payload's values. At most five, which is enough to see which field drifted.
 */
export class CatalogShapeError extends Error implements LoggableError {
  readonly retryable = false;
  readonly issues: { path: string; code: string }[];
  constructor(
    issues: readonly { path: readonly PropertyKey[]; code: string }[],
    readonly issueCount: number = issues.length,
  ) {
    super(`showroom_catalog payload failed validation (${issueCount} issue(s))`);
    this.name = "CatalogShapeError";
    this.issues = issues
      .slice(0, 5)
      .map((i) => ({ path: i.path.map(String).join("."), code: i.code }));
  }
  logFields() {
    return { issue_count: this.issueCount, issues: this.issues };
  }
}

/** Thrown for a non-2xx answer from the database gateway. Carries the status only, never the body. */
export class CatalogHttpError extends Error implements LoggableError {
  constructor(readonly status: number) {
    super(`showroom_catalog answered ${status}`);
    this.name = "CatalogHttpError";
  }
  /** 5xx and 429 may pass on a second try; any other 4xx (a wrong key, a bad call) won't. */
  get retryable() {
    return this.status >= 500 || this.status === 429;
  }
  logFields() {
    return { status: this.status };
  }
}

export function isLoggableError(err: unknown): err is LoggableError {
  return (
    typeof err === "object" &&
    err !== null &&
    typeof (err as LoggableError).logFields === "function" &&
    typeof (err as LoggableError).retryable === "boolean"
  );
}

export function supabaseCatalogSource(
  url: string,
  anonKey: string,
  fetchImpl: typeof fetch = fetch,
): CatalogSource {
  const endpoint = `${url.replace(/\/+$/, "")}/rest/v1/rpc/showroom_catalog`;
  return {
    async load(subdomain, signal, traceId) {
      // GET, which PostgREST allows for a stable function. A subdomain is a public DNS label, not
      // personal data. `no-store`: caching is withHardTtlCache's job, never Next's (see above).
      const res = await fetchImpl(`${endpoint}?p_subdomain=${encodeURIComponent(subdomain)}`, {
        method: "GET",
        headers: {
          apikey: anonKey,
          authorization: `Bearer ${anonKey}`,
          accept: "application/json",
          // One trace id end to end: the gateway logs it with the request.
          ...(traceId ? { "x-request-id": traceId } : {}),
        },
        signal,
        cache: "no-store",
      });
      if (!res.ok) throw new CatalogHttpError(res.status);
      const body: unknown = await res.json();
      if (body === null) return null;
      const parsed = ShowroomCatalog.safeParse(body);
      if (!parsed.success) throw new CatalogShapeError(parsed.error.issues);
      return parsed.data;
    },
  };
}

/**
 * The configured source, or null (the page then answers 404 and logs `source_unconfigured`).
 * - `SHOWROOM_SOURCE=fixture`: the demo fixture, local development only. It is refused in a
 *   production build and on any Vercel deployment.
 * - `SUPABASE_URL` + `SUPABASE_ANON_KEY`: the database. Both are server-only variables; the anon
 *   key is public by design, but it has no reason to be in a browser bundle here.
 */
export async function configuredCatalogSource(
  env: Record<string, string | undefined> = process.env,
): Promise<CatalogSource | null> {
  const deployed = Boolean(env.VERCEL || env.VERCEL_ENV);
  if (env.NODE_ENV !== "production" && !deployed && env.SHOWROOM_SOURCE === "fixture") {
    const { demoCatalog } = await import("./fixtures/demo-catalog");
    return {
      load: async (subdomain) => {
        const snapshot = demoCatalog();
        return snapshot.market.subdomain === subdomain ? snapshot : null;
      },
    };
  }
  if (env.SUPABASE_URL && env.SUPABASE_ANON_KEY) {
    return withHardTtlCache(supabaseCatalogSource(env.SUPABASE_URL, env.SUPABASE_ANON_KEY), {
      store: instanceCache,
    });
  }
  return null;
}
