// Edge function: capture-lead (1·A slice 8, caller authorization from blocker 2). ADR 0013.
//
// Leads are stricter than events (CLAUDE.md): capture is synchronous and acknowledged, and any
// failure pages someone. The only acceptable outcomes are "stored" or "in the dead-letter queue".
//
// This function is reachable by anonymous visitors, so it holds NO service-role key (production
// plan §3.1, owner decision). It calls one database function, public.capture_lead_public, with the
// ANON key. That function:
//   * resolves the brand from the publishable key + origin + market header (never the body),
//   * rate-limits per visitor,
//   * writes the lead, its consent and its first activity in one transaction, or dead-letters it.
// Before that call, this function does the one thing the database can't: the Turnstile bot check.
// It then passes the gateway secret that proves the call came through here.
import { createClient } from "npm:@supabase/supabase-js@2";
import { logger, requireEnv } from "../shared/log.ts";
import {
  clientAddress,
  clientId,
  readPublicCaller,
  refusalStatus,
} from "../shared/public-caller.ts";
import { verifyTurnstile } from "../shared/turnstile.ts";
import { decidePublicLead, rejectionLog } from "./lead.ts";

const log = logger("capture-lead");
const REQUIRED = [
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "CAPTURE_GATEWAY_SECRET",
  "CLIENT_HASH_SECRET",
  "TURNSTILE_SECRET_KEY",
] as const;
const DB_TIMEOUT_MS = 10_000;

/** Postgres unique_violation: a submission_id reused for a different person. */
const SUBMISSION_REUSED = "23505";

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
    // A deploy mistake, not an attack. Loud, so it's fixed before a visitor meets it twice.
    log("error", "capture_misconfigured", { trace_id: traceId, missing: env.missing });
    return json({ error: "Could not capture the lead. Please try again.", trace_id: traceId }, 503);
  }
  const secret = env.values as Record<(typeof REQUIRED)[number], string>;

  const caller = readPublicCaller(request.headers);
  if (!caller) {
    log("warn", "lead_refused_no_caller", { trace_id: traceId });
    return json({ error: "Not authorized.", trace_id: traceId }, 403);
  }

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    body = parsed as Record<string, unknown>;
  } catch {
    log("warn", "lead_refused_not_json", { trace_id: traceId });
    return json({ error: "Body must be a JSON object.", trace_id: traceId }, 400);
  }

  // The bot check. Fails closed: no token, no clear "yes", or solved on another site means no.
  const address = clientAddress(request.headers);
  const human = await verifyTurnstile(
    typeof body.turnstile_token === "string" ? body.turnstile_token : null,
    address,
    new URL(caller.origin).hostname,
    { secret: secret.TURNSTILE_SECRET_KEY, fetch, timeoutMs: 5_000 },
  );
  if (!human) {
    log("warn", "lead_refused_bot_check", { trace_id: traceId, market: caller.market });
    return json(
      { error: "Please complete the verification and try again.", trace_id: traceId },
      403,
    );
  }

  const submission = { ...body };
  delete submission.turnstile_token;
  const decision = decidePublicLead(submission);
  if (decision.outcome === "reject") {
    // The form's problem, not a delivery failure: logged by shape (never content) and refused.
    console.warn(JSON.stringify(rejectionLog(decision, traceId)));
    return json({ error: decision.error_message, trace_id: traceId }, 422);
  }

  const anon = createClient(secret.SUPABASE_URL, secret.SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const { data, error } = await anon
    .rpc("capture_lead_public", {
      p_gateway: secret.CAPTURE_GATEWAY_SECRET,
      p_key: caller.key,
      p_origin: caller.origin,
      p_market_code: caller.market,
      p_client: await clientId(address, secret.CLIENT_HASH_SECRET),
      p_lead: decision.lead,
    })
    .abortSignal(AbortSignal.timeout(DB_TIMEOUT_MS));

  if (error) {
    const refused = refusalStatus(error.code);
    if (refused) {
      log("warn", "lead_refused", { trace_id: traceId, code: error.code, market: caller.market });
      return json({ error: refused.error, trace_id: traceId }, refused.status);
    }
    // The database is unreachable, timed out, or failed before it could dead-letter. Nothing was
    // stored: say so and let the visitor retry (the submission_id makes a retry safe; the form
    // needs a fresh Turnstile token). A lead we could not even queue pages.
    log("error", "lead_not_captured", { trace_id: traceId, code: error.code });
    return json({ error: "Could not capture the lead. Please try again.", trace_id: traceId }, 503);
  }

  const result = (data ?? {}) as { status?: string; code?: string };
  switch (result.status) {
    case "captured":
      log("info", "lead_captured", { trace_id: traceId, market: caller.market });
      return json({ status: "received", trace_id: traceId }, 201);
    case "dead_lettered":
      // Queued for replay, not lost, so the visitor is told it's received. Still an incident:
      // a lead DLQ entry pages (§6.2).
      log("error", "lead_dead_lettered", { trace_id: traceId, market: caller.market });
      return json({ status: "received", trace_id: traceId }, 201);
    case "rejected":
      log("warn", "lead_rejected_by_database", { trace_id: traceId, code: result.code });
      return result.code === SUBMISSION_REUSED
        ? json({ error: "This submission id was already used.", trace_id: traceId }, 409)
        : json({ error: "The submission was not accepted.", trace_id: traceId }, 422);
    default:
      log("error", "lead_unexpected_result", { trace_id: traceId });
      return json(
        { error: "Could not capture the lead. Please try again.", trace_id: traceId },
        503,
      );
  }
});
