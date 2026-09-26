import { PostHog } from "posthog-node";

// Server-side feature flags (CLAUDE.md: flags default off, enforced server-side, with a verified
// kill path). Every failure mode resolves to OFF — no key configured, PostHog unreachable, a slow
// answer, an unexpected value — so a flag can only ever turn something on deliberately.

/** The subset of the PostHog client this module needs (lets tests pass a fake). */
export interface FlagClient {
  isFeatureEnabled(
    key: string,
    distinctId: string,
    options?: { sendFeatureFlagEvents?: boolean; disableGeoip?: boolean },
  ): Promise<boolean | undefined>;
}

// Some gates are keyed by ids a visitor can influence (the showroom keys on the host's subdomain).
// So evaluation never records a $feature_flag_called event or geo data: an arbitrary host must
// not be able to create PostHog persons or events at our cost.
export const EVAL_OPTIONS = { sendFeatureFlagEvents: false, disableGeoip: true } as const;

/** Every flag key the app reads — one place to see what is gated. */
export const FLAGS = {
  /** Build details on /api/health. Used to exercise create → off → on → kill (REV2 0-H.6). */
  healthBuildInfo: "health_build_info",
  /** The whole showroom page (PAGE-CONSUMER-SHOWROOM). Distinct id = the brand-market subdomain. */
  pageShowroom: "page_showroom",
} as const;

export const FLAG_TIMEOUT_MS = 1500;

let cached: FlagClient | null | undefined;

function defaultClient(): FlagClient | null {
  if (cached !== undefined) return cached;
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  cached = key
    ? new PostHog(key, {
        host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://eu.i.posthog.com",
        flushAt: 1,
        flushInterval: 0,
      })
    : null;
  return cached;
}

function logFlagFailure(flag: string, reason: string, traceId?: string): void {
  // Structured, no PII: the flag key and why it resolved to off, joined to the request's trace.
  console.warn(
    JSON.stringify({ level: "warn", event: "flag_eval_failed", flag, reason, trace_id: traceId }),
  );
}

/** True only when PostHog explicitly says the flag is on for this caller. */
export async function isFlagEnabled(
  flag: string,
  distinctId: string,
  client: FlagClient | null = defaultClient(),
  timeoutMs: number = FLAG_TIMEOUT_MS,
  traceId?: string,
): Promise<boolean> {
  if (!client) return false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), timeoutMs);
  });
  try {
    const result = await Promise.race([
      client.isFeatureEnabled(flag, distinctId, EVAL_OPTIONS),
      timeout,
    ]);
    if (result === "timeout") {
      logFlagFailure(flag, "timeout", traceId);
      return false;
    }
    return result === true;
  } catch (err) {
    logFlagFailure(flag, err instanceof Error ? err.name : "unknown", traceId);
    return false;
  } finally {
    clearTimeout(timer);
  }
}
