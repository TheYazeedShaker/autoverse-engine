// Edge function: capture-lead (1·A slice 8).
//
// Leads are stricter than events (CLAUDE.md): capture is synchronous and acknowledged, and any
// failure pages someone. A dropped lead is a person who believes they asked to be called and never
// hears back, so the only acceptable outcomes are "stored" or "in the dead-letter queue".
//
// The lead, its consent and its first activity are written by public.capture_lead in ONE
// transaction — two PostgREST inserts could leave a lead with no audit trail if the second failed.
import { createClient } from "npm:@supabase/supabase-js@2";
import { decideLead, rejectionLog } from "./lead.ts";

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return json({ error: "Use POST." }, 405);
  const traceId = request.headers.get("x-trace-id") ?? crypto.randomUUID();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Body must be JSON.", trace_id: traceId }, 400);
  }

  const decision = decideLead(body);
  if (decision.outcome === "reject") {
    // A malformed submission is the form's problem, not a delivery failure: it is logged (by shape,
    // never content) and refused, not queued. Queueing it would imply we can eventually store it.
    console.warn(JSON.stringify(rejectionLog(decision, traceId)));
    return json({ error: decision.error_message, trace_id: traceId }, 422);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  const { data, error } = await supabase.rpc("capture_lead", { payload: decision.lead });

  if (error) {
    // We accepted responsibility for a valid lead and could not store it. It goes to the queue with
    // the payload intact so it can be replayed, and the caller is told plainly that it failed —
    // acknowledging a lead we did not store would be worse than an error.
    const { error: dlqError } = await supabase.from("lead_dlq").insert({
      source_payload: decision.lead,
      error_message: `capture_lead failed: ${error.code ?? error.message}`,
    });
    console.error(
      JSON.stringify({
        level: "error",
        event: dlqError ? "lead_lost" : "lead_dead_lettered",
        trace_id: traceId,
        code: error.code,
      }),
    );
    return json({ error: "Could not capture the lead.", trace_id: traceId }, 503);
  }

  console.log(JSON.stringify({ level: "info", event: "lead_captured", trace_id: traceId }));
  return json({ lead_id: data, trace_id: traceId }, 201);
});
