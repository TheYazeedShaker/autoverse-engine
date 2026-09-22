// Edge function: ingest-event (1·A slice 7).
//
// Accepts one event or a batch, validates each against the schema, upserts the good ones on their
// id (the idempotency key) and sends the rest to event_dlq. It answers 202 for anything it managed
// to take responsibility for — including dead letters — and never 5xx for a bad payload: a consumer
// surface must not break because our pipeline is unwell, and a retrying client hammering a failing
// endpoint makes an incident worse.
import { createClient } from "npm:@supabase/supabase-js@2";
import { decideBatch } from "./ingest.ts";

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

const log = (event: string, fields: Record<string, unknown> = {}) =>
  console.log(JSON.stringify({ level: "info", event, ...fields }));

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return json({ error: "Use POST." }, 405);
  const traceId = request.headers.get("x-trace-id") ?? crypto.randomUUID();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    // Not even JSON: nothing to dead-letter meaningfully, and nothing to retry.
    return json({ error: "Body must be JSON.", trace_id: traceId }, 400);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  const decisions = decideBatch(body);
  const accepted = decisions.flatMap((d) => (d.outcome === "accept" ? [d.event] : []));
  const rejected = decisions.flatMap((d) => (d.outcome === "dead-letter" ? [d] : []));

  if (accepted.length > 0) {
    const { error } = await supabase.from("events").upsert(accepted, { onConflict: "id" });
    if (error) {
      // The store itself failed, so everything in this request becomes a dead letter rather than
      // being lost. Zero loss is the point of the queue.
      rejected.push(
        ...accepted.map((event) => ({
          outcome: "dead-letter" as const,
          source_payload: event as unknown as Record<string, unknown>,
          error_message: `events upsert failed: ${error.code ?? error.message}`,
        })),
      );
      accepted.length = 0;
    }
  }

  if (rejected.length > 0) {
    const { error } = await supabase
      .from("event_dlq")
      .insert(
        rejected.map((r) => ({ source_payload: r.source_payload, error_message: r.error_message })),
      );
    if (error) {
      // Nothing left to fall back on: this is the one case worth a 5xx, because the caller
      // retrying is now the only way the event survives.
      console.error(
        JSON.stringify({
          level: "error",
          event: "event_dlq_write_failed",
          trace_id: traceId,
          code: error.code,
        }),
      );
      return json({ error: "Could not accept events.", trace_id: traceId }, 503);
    }
  }

  log("events_ingested", {
    trace_id: traceId,
    accepted: accepted.length,
    dead_lettered: rejected.length,
  });
  return json(
    { accepted: accepted.length, dead_lettered: rejected.length, trace_id: traceId },
    202,
  );
});
