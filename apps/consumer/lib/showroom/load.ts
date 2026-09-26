import type { Logger } from "../log";
import { isVercelPreviewHost, subdomainFromHost } from "./host";
import { buildShowroom, type Showroom } from "./loader";
import { isLoggableError, type CatalogSource } from "./source";
import { themeCss } from "./theme";

// One showroom request, start to finish: host → subdomain → flag → catalogue → view.
//
// Every "no" is the same plain 404 to the visitor (spec §2: no brand leakage). The log says which
// one it was. The flag is checked before the catalogue is read, so the kill path costs nothing
// and needs no database. A catalogue that can't be read is not a 404: the page errors (5xx), is
// reported, and a visitor can retry.

// Per attempt. Worst case before the page errors: 1.5 s flag + 2 attempts × 2 s = 5.5 s.
export const SOURCE_TIMEOUT_MS = 2000;

export type NotFoundReason =
  "host_unresolved" | "flag_off" | "source_unconfigured" | "unknown_subdomain";

export type LoadOutcome =
  | { kind: "ok"; showroom: Showroom; themeCss: string | null }
  | { kind: "not_found"; reason: NotFoundReason }
  | { kind: "unavailable" };

export interface LoadDeps {
  host: string | null;
  rootDomain: string | undefined;
  /**
   * Vercel preview deployments only: the brand-market a `*.vercel.app` preview address shows (see
   * previewSubdomain in host.ts). Undefined everywhere else.
   */
  previewSubdomain?: string | null;
  /** Server-side flag check, keyed by the brand-market's subdomain. Fails closed. */
  isEnabled: (subdomain: string) => Promise<boolean>;
  source: CatalogSource | null;
  log: Logger;
  /** Sent to the database gateway with each catalogue read. */
  traceId?: string;
  timeoutMs?: number;
  now?: () => number;
}

export async function loadShowroomPage(deps: LoadDeps): Promise<LoadOutcome> {
  const { log } = deps;
  const now = deps.now ?? Date.now;
  const started = now();
  const notFound = (reason: NotFoundReason, fields: Record<string, unknown> = {}): LoadOutcome => {
    log("info", "showroom_not_found", { reason, ...fields });
    return { kind: "not_found", reason };
  };

  let subdomain = subdomainFromHost(deps.host, deps.rootDomain);
  if (!subdomain && deps.previewSubdomain && isVercelPreviewHost(deps.host)) {
    subdomain = deps.previewSubdomain;
    log("info", "showroom_preview_mapping", { subdomain });
  }
  if (!subdomain) {
    if (!deps.rootDomain && !deps.previewSubdomain)
      log("error", "showroom_misconfigured", { missing: "CONSUMER_ROOT_DOMAIN" });
    return notFound("host_unresolved");
  }
  if (!(await deps.isEnabled(subdomain))) return notFound("flag_off", { subdomain });
  if (!deps.source) return notFound("source_unconfigured", { subdomain });

  log("info", "showroom_load_start", { subdomain });
  const snapshot = await readWithRetry(
    deps.source,
    subdomain,
    deps.timeoutMs ?? SOURCE_TIMEOUT_MS,
    log,
    deps.traceId,
  );
  if (snapshot === "failed") {
    log("error", "showroom_load_failed", { subdomain, duration_ms: now() - started });
    return { kind: "unavailable" };
  }
  // Unknown, dormant and not-live brand-markets all come back as null (ADR 0018).
  if (!snapshot) return notFound("unknown_subdomain", { subdomain });
  // Second layer: the snapshot must be the brand-market this host named. A source bug (a wrong
  // cache key, a wrong argument) must never render one brand's catalogue under another's host.
  // The payload is one document for one brand-market, so this is the check that matters; the theme
  // comes inside it and can't belong to anyone else.
  if (snapshot.market.subdomain !== subdomain) {
    log("error", "showroom_source_mismatch", { subdomain });
    return { kind: "unavailable" };
  }

  const showroom = buildShowroom(snapshot, log);

  let css: string | null = null;
  if (snapshot.theme) {
    const theme = themeCss(snapshot.theme);
    // A bad theme row can't happen past the database's CHECKs; if it does, the page still
    // renders in the neutral system accent rather than failing.
    if (theme.ok) css = theme.css;
    else log("error", "showroom_theme_invalid", { brand: showroom.brand.slug, field: theme.field });
  } else {
    log("warn", "showroom_theme_missing", {
      brand: showroom.brand.slug,
      market: showroom.market.code,
    });
  }

  log("info", "showroom_load_done", {
    subdomain,
    brand: showroom.brand.slug,
    market: showroom.market.code,
    models: showroom.models.length,
    duration_ms: now() - started,
  });
  return { kind: "ok", showroom, themeCss: css };
}

/**
 * A catalogue read is idempotent, so it gets one retry. Each attempt has its own timeout, and a
 * timed-out attempt is aborted, so it doesn't keep running beside the retry.
 */
async function readWithRetry(
  source: CatalogSource,
  subdomain: string,
  timeoutMs: number,
  log: Logger,
  traceId: string | undefined,
): Promise<Awaited<ReturnType<CatalogSource["load"]>> | "failed"> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        const e = new Error(`timed out after ${timeoutMs}ms`);
        e.name = "TimeoutError";
        controller.abort(e);
        reject(e);
      }, timeoutMs);
    });
    try {
      return await Promise.race([source.load(subdomain, controller.signal, traceId), timeout]);
    } catch (err) {
      const retryable = isLoggableError(err) ? err.retryable : true;
      log("warn", "showroom_source_error", {
        subdomain,
        attempt,
        error: err instanceof Error ? err.name : "unknown",
        retryable,
        // Status for HTTP errors; schema paths and codes for a contract break. Never values.
        ...(isLoggableError(err) ? err.logFields() : {}),
      });
      // A contract break or a 4xx fails the same way twice: don't double the latency and the noise.
      // Timeouts, network errors, 5xx and 429 get the second attempt.
      if (!retryable) break;
    } finally {
      clearTimeout(timer);
    }
  }
  return "failed";
}
