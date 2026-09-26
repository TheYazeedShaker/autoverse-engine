import type { Logger } from "../log";
import { subdomainFromHost } from "./host";
import { buildShowroom, type Showroom } from "./loader";
import type { CatalogSource } from "./source";
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
  "host_unresolved" | "flag_off" | "source_unconfigured" | "unknown_subdomain" | "not_live";

export type LoadOutcome =
  | { kind: "ok"; showroom: Showroom; themeCss: string | null }
  | { kind: "not_found"; reason: NotFoundReason }
  | { kind: "unavailable" };

export interface LoadDeps {
  host: string | null;
  rootDomain: string | undefined;
  /** Server-side flag check, keyed by the brand-market's subdomain. Fails closed. */
  isEnabled: (subdomain: string) => Promise<boolean>;
  source: CatalogSource | null;
  log: Logger;
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

  const subdomain = subdomainFromHost(deps.host, deps.rootDomain);
  if (!subdomain) {
    if (!deps.rootDomain)
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
  );
  if (snapshot === "failed") {
    log("error", "showroom_load_failed", { subdomain, duration_ms: now() - started });
    return { kind: "unavailable" };
  }
  if (!snapshot) return notFound("unknown_subdomain", { subdomain });
  // Second layer: the snapshot must be the brand-market this host named. A source bug (a wrong
  // join, a stale cache key) must never render one brand's catalogue under another's host.
  if (snapshot.market.subdomain !== subdomain) {
    log("error", "showroom_source_mismatch", { subdomain });
    return { kind: "unavailable" };
  }

  const showroom = buildShowroom(snapshot, log);
  if (!showroom) return notFound("not_live", { subdomain });

  let css: string | null = null;
  if (
    snapshot.theme &&
    (snapshot.theme.brand_id !== snapshot.brand.id ||
      snapshot.theme.market_code !== snapshot.market.market_code)
  ) {
    // Another brand-market's theme: never apply it. Neutral accent instead.
    log("error", "showroom_theme_mismatch", { brand: showroom.brand.slug });
  } else if (snapshot.theme) {
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
      return await Promise.race([source.load(subdomain, controller.signal), timeout]);
    } catch (err) {
      log("warn", "showroom_source_error", {
        subdomain,
        attempt,
        error: err instanceof Error ? err.name : "unknown",
      });
    } finally {
      clearTimeout(timer);
    }
  }
  return "failed";
}
