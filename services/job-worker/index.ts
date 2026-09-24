// Edge function: job-worker (ADR 0011).
//
// Fired every minute by pg_cron (via pg_net) with the shared secret, or by a superadmin/ops user's
// "run now". Runs one bounded pass of the queue and answers with counts only.
//
// verify_jwt is off for this function (supabase/config.toml) because the cron call carries the
// shared secret, not a JWT. auth.ts does the checking instead, and refuses everyone else.
import { createClient } from "npm:@supabase/supabase-js@2";
import { authorize } from "../shared/auth.ts";
import { isTenancyManager } from "../shared/staff.ts";
import { supabaseStore } from "./supabase-store.ts";
import { runOnce } from "./worker.ts";

const env = (name: string) => Deno.env.get(name) ?? "";

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return json({ error: "Use POST." }, 405);
  const traceId = request.headers.get("x-trace-id") ?? crypto.randomUUID();

  const caller = await authorize(request.headers.get("authorization"), {
    cronSecret: Deno.env.get("JOB_WORKER_CRON_SECRET") || undefined,
    isTenancyManager,
  });
  if (!caller) {
    console.warn(JSON.stringify({ level: "warn", event: "job_worker_refused", trace_id: traceId }));
    return json({ error: "Not authorized.", trace_id: traceId }, 401);
  }

  // A server-side job: the one place outside CI the service role belongs (production plan §3.1).
  const service = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });
  const summary = await runOnce(supabaseStore(service), {
    budgetMs: 50_000,
    routing: {
      resendApiKey: Deno.env.get("RESEND_API_KEY") || undefined,
      leadEmailFrom: Deno.env.get("LEAD_EMAIL_FROM") || undefined,
    },
  });
  return json({ ...summary, caller, trace_id: traceId }, 200);
});
