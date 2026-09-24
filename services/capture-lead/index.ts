// Edge function: capture-lead (1·A slice 8, caller authorization from blocker 2).
//
// Leads are stricter than events (CLAUDE.md): capture is synchronous and acknowledged, and any
// failure pages someone. The only acceptable outcomes are "stored" or "in the dead-letter queue".
//
// This function is reachable by anonymous visitors, so it holds NO service-role key (production
// plan §3.1, owner decision). It calls one database function, public.capture_lead_public, with the
// ANON key. That function:
//   * resolves the brand from the publishable key + origin + market header (never the body),
//   * rate-limits per visitor and per brand,
//   * writes the lead, its consent and its first activity in one transaction, or dead-letters it.
// Before that call, this function does the one thing the database can't: the Turnstile bot check.
// It then passes the gateway secret that proves the call came through here.
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  clientAddress,
  clientId,
  readPublicCaller,
  refusalStatus,
} from "../shared/public-caller.ts";
import { verifyTurnstile } from "../shared/turnstile.ts";
import { decidePublicLead, rejectionLog } from "./lead.ts";

/** Postgres unique_violation, raised by capture_lead when a submission_id is reused for another lead. */
const SUBMISSION_REUSED = "23505";

/** Rules capture_lead_public raises back rather than dead-lettering: the sender's mistake. */
const SENDER_ERRORS = new Set(["23514", "23502", "23503", "22P02", "22007", "22008", "22001"]);

const env = (name: string) => Deno.env.get(name) ?? "";

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

const log = (level: "info" | "warn" | "error", event: string, fields: Record<string, unknown>) => {
  const line = JSON.stringify({ level, event, service: "capture-lead", ...fields });
  if (level === "info") console.log(line);
  else if (level === "warn") console.warn(line);
  else console.error(line);
};

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return json({ error: "Use POST." }, 405);
  const traceId = request.headers.get("x-trace-id") ?? crypto.randomUUID();

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
    return json({ error: "Body must be a JSON object.", trace_id: traceId }, 400);
  }

  // The bot check. Fails closed: no token, no secret, or no clear "yes" from Cloudflare means no.
  const address = clientAddress(request.headers);
  const human = await verifyTurnstile(
    typeof body.turnstile_token === "string" ? body.turnstile_token : null,
    address,
    { secret: Deno.env.get("TURNSTILE_SECRET_KEY") || undefined, fetch, timeoutMs: 5_000 },
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

  const anon = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
    auth: { persistSession: false },
  });
  const { data, error } = await anon.rpc("capture_lead_public", {
    p_gateway: env("CAPTURE_GATEWAY_SECRET"),
    p_key: caller.key,
    p_origin: caller.origin,
    p_market_code: caller.market,
    p_client: await clientId(address, env("CLIENT_HASH_SECRET")),
    p_lead: decision.lead,
  });

  if (error) {
    const refused = refusalStatus(error.code);
    if (refused) {
      log("warn", "lead_refused", { trace_id: traceId, code: error.code, market: caller.market });
      return json({ error: refused.error, trace_id: traceId }, refused.status);
    }
    if (error.code === SUBMISSION_REUSED) {
      log("warn", "lead_submission_reused", { trace_id: traceId });
      return json({ error: "This submission id was already used.", trace_id: traceId }, 409);
    }
    if (error.code && SENDER_ERRORS.has(error.code)) {
      // Refused by a database rule the schema didn't catch (e.g. a model from another brand).
      log("warn", "lead_rejected_by_database", { trace_id: traceId, code: error.code });
      return json({ error: "The submission was not accepted.", trace_id: traceId }, 422);
    }
    // The database is unreachable or failed before it could dead-letter. Nothing was stored, and
    // the page must say so and let the visitor retry (the submission_id makes a retry safe).
    // This pages: a lead we could not even queue.
    log("error", "lead_not_captured", { trace_id: traceId, code: error.code });
    return json({ error: "Could not capture the lead. Please try again.", trace_id: traceId }, 503);
  }

  const status = (data as { status?: string } | null)?.status;
  if (status === "dead_lettered") {
    // Stored for replay, not lost. Still an incident: a lead DLQ entry pages (§6.2).
    log("error", "lead_dead_lettered", { trace_id: traceId, market: caller.market });
  } else {
    log("info", "lead_captured", { trace_id: traceId, market: caller.market });
  }
  // Acknowledged either way: the lead is ours now, captured or queued.
  return json({ status: "received", trace_id: traceId }, 201);
});
