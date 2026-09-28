// CORS for the public capture functions (capture-lead, ingest-event). Pure, so it is unit tested
// in Node and runs in Deno.
//
// A brand page calls these functions straight from the browser, with the custom headers the page
// contract names (docs/runbooks/public-capture-rollout.md). Custom headers make the browser send a
// preflight OPTIONS first, and without an answer to it the real POST is never sent.
//
// CORS is NOT the access control here. The database admits a caller only if its publishable key,
// its Origin and its market header match a live brand-market's allowlist (ADR 0013), and a script
// outside a browser ignores CORS anyway. So the answer is the same for every origin: `*`, with no
// credentials (these functions read no cookies). What a response exposes is a generic message and
// a trace id, never data.

/** The request headers a page may send: the page contract's two, the trace id, and the body type. */
export const CAPTURE_REQUEST_HEADERS = [
  "content-type",
  "x-autoverse-key",
  "x-autoverse-market",
  "x-trace-id",
] as const;

/** How long a browser may reuse one preflight answer, in seconds. */
export const PREFLIGHT_MAX_AGE_S = 600;

/** Headers every response carries, so the page can read the status and body of any answer. */
export function corsHeaders(): Record<string, string> {
  return { "access-control-allow-origin": "*" };
}

/** The answer to a preflight OPTIONS request: 204, no body. */
export function preflightResponse(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      ...corsHeaders(),
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": CAPTURE_REQUEST_HEADERS.join(", "),
      "access-control-max-age": String(PREFLIGHT_MAX_AGE_S),
    },
  });
}
