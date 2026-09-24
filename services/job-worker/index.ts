// Edge function: job-worker (ADR 0011).
//
// Fired every minute by pg_cron (via pg_net) with the shared secret, or by a superadmin/ops user's
// "run now". Runs one bounded pass of the queue and answers with counts only.
//
// verify_jwt is off for this function (supabase/config.toml) because the cron call carries the
// shared secret, not a JWT. shared/auth.ts does the checking instead, and refuses everyone else.
import { createClient } from "@supabase/supabase-js";
import { authorize } from "../shared/auth.ts";
import { logger, requireEnv } from "../shared/log.ts";
import { isTenancyManager } from "../shared/staff.ts";
import { supabaseStore } from "./supabase-store.ts";
import { runOnce } from "./worker.ts";

const log = logger("job-worker");
const REQUIRED = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "JOB_WORKER_CRON_SECRET"] as const;

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
    // A deploy mistake, not an attack. Loud, and nothing runs.
    log("error", "job_worker_misconfigured", { trace_id: traceId, missing: env.missing });
    return json({ error: "Not configured.", trace_id: traceId }, 503);
  }

  const caller = await authorize(request.headers.get("authorization"), {
    cronSecret: env.values.JOB_WORKER_CRON_SECRET,
    isTenancyManager,
  });
  if (!caller) {
    log("warn", "job_worker_refused", { trace_id: traceId });
    return json({ error: "Not authorized.", trace_id: traceId }, 401);
  }

  try {
    // A server-side job: the one place outside CI the service role belongs (production plan §3.1).
    const service = createClient(env.values.SUPABASE_URL!, env.values.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false },
    });
    const summary = await runOnce(supabaseStore(service), {
      log,
      routing: {
        resendApiKey: Deno.env.get("RESEND_API_KEY") || undefined,
        leadEmailFrom: Deno.env.get("LEAD_EMAIL_FROM") || undefined,
      },
    });
    return json({ ...summary, caller, trace_id: traceId }, 200);
  } catch (error) {
    // The queue itself was unreachable (enqueue or claim failed). Nothing was lost: jobs stay
    // pending and the next tick tries again. Logged so a run of these alerts.
    log("error", "worker_run_failed", {
      trace_id: traceId,
      reason: error instanceof Error ? error.message : String(error),
    });
    return json({ error: "Worker run failed.", trace_id: traceId }, 500);
  }
});
