// Edge function: ingest-event (1·A slice 7, caller authorization from blocker 2). ADR 0013.
//
// Accepts one event or a batch from a page. It answers 202 for anything it managed to take
// responsibility for, dead letters included, and never 5xx for a bad payload: a consumer surface
// must not break because our pipeline is unwell.
//
// Reachable by anonymous visitors, so it holds NO service-role key (production plan §3.1, owner
// decision). It calls public.ingest_events_public with the ANON key. That function resolves the
// brand from the publishable key + origin + market header (never the body), rate-limits per event,
// stores each event idempotently on its id (ON CONFLICT DO NOTHING), and dead-letters anything it
// can't store. Events that fail the schema here are passed along as rejects, so they're
// dead-lettered rather than lost. This function no longer holds a key that could write event_dlq.
import { createClient } from "@supabase/supabase-js";
import { logger, requireEnv } from "../shared/log.ts";
import {
  clientAddress,
  clientId,
  readPublicCaller,
  refusalStatus,
} from "../shared/public-caller.ts";
import { decidePublicBatch } from "./ingest.ts";

const log = logger("ingest-event");
const REQUIRED = [
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "CAPTURE_GATEWAY_SECRET",
  "CLIENT_HASH_SECRET",
] as const;
const DB_TIMEOUT_MS = 10_000;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return json({ error: "Use POST." }, 405);
  const traceId = request.headers.get("x-trace-id") ?? crypto.randomUUID();

  const env = requireEnv((name) => Deno.env.get(name), REQUIRED);
  if (!env.ok) {
    log("error", "capture_misconfigured", { trace_id: traceId, missing: env.missing });
    return json({ error: "Could not accept events.", trace_id: traceId }, 503);
  }
  const secret = env.values as Record<(typeof REQUIRED)[number], string>;

  const caller = readPublicCaller(request.headers);
  if (!caller) {
    log("warn", "events_refused_no_caller", { trace_id: traceId });
    return json({ error: "Not authorized.", trace_id: traceId }, 403);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    // Not even JSON: nothing to dead-letter meaningfully, and nothing to retry.
    log("warn", "events_refused_not_json", { trace_id: traceId });
    return json({ error: "Body must be JSON.", trace_id: traceId }, 400);
  }

  const decisions = decidePublicBatch(body);
  const accepted = decisions.flatMap((d) => (d.outcome === "accept" ? [d.event] : []));
  const rejected = decisions.flatMap((d) =>
    d.outcome === "dead-letter"
      ? [{ source_payload: d.source_payload, error_message: d.error_message }]
      : [],
  );

  const anon = createClient(secret.SUPABASE_URL, secret.SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const { data, error } = await anon
    .rpc("ingest_events_public", {
      p_gateway: secret.CAPTURE_GATEWAY_SECRET,
      p_key: caller.key,
      p_origin: caller.origin,
      p_market_code: caller.market,
      p_client: await clientId(clientAddress(request.headers), secret.CLIENT_HASH_SECRET),
      p_events: accepted,
      p_rejected: rejected,
    })
    .abortSignal(AbortSignal.timeout(DB_TIMEOUT_MS));

  if (error) {
    const refused = refusalStatus(error.code);
    if (refused) {
      log("warn", "events_refused", { trace_id: traceId, code: error.code, market: caller.market });
      return json({ error: refused.error, trace_id: traceId }, refused.status);
    }
    // The database didn't take the batch at all (unreachable or timed out). The caller retrying is
    // now the only way these events survive (they are idempotent on id, so a retry is safe).
    log("error", "events_not_ingested", { trace_id: traceId, code: error.code });
    return json({ error: "Could not accept events.", trace_id: traceId }, 503);
  }

  const result = (data ?? {}) as { accepted?: number; dead_lettered?: number };
  log("info", "events_ingested", { trace_id: traceId, market: caller.market, ...result });
  return json({ ...result, trace_id: traceId }, 202);
});
