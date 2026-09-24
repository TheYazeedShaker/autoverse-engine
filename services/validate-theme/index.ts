// Edge function: validate-theme (theming REV).
//
// Receives { brand_id, market_code, accent_hex }, derives hover/muted/focus/on-accent server-side,
// gates on the four AA pairs, and upserts brand_themes on success. A failing accent returns 422
// naming the pair that failed, so an operator sees "accent text on the Mist canvas is 2.1:1, needs
// 4.5:1" instead of "invalid".
//
// Only a superadmin or ops user may call it (owner decision; the scope of can_manage_tenancy()).
// The caller's JWT is checked BEFORE the body is read or the service role is touched, so an
// anonymous or brand caller never reaches the write. It then runs with the service-role key:
// brand_themes has no write policy, and this is the only writer.
// The derivation itself lives in theme.ts so it can be unit tested by vitest; this file is the thin
// HTTP + database shell around it.
import { createClient } from "@supabase/supabase-js";
import { bearerToken } from "../shared/auth.ts";
import { logger, requireEnv } from "../shared/log.ts";
import { isTenancyManager } from "../shared/staff.ts";
import { validateThemeRequest } from "./theme.ts";

const log = logger("validate-theme");

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return json({ error: "Use POST." }, 405);

  const env = requireEnv(
    (name) => Deno.env.get(name),
    ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"],
  );
  if (!env.ok) {
    log("error", "validate_theme_misconfigured", { missing: env.missing });
    return json({ error: "Not configured." }, 503);
  }

  // 401: no credentials. 403: credentials, but not a superadmin/ops user.
  const jwt = bearerToken(request.headers.get("authorization"));
  if (!jwt) return json({ error: "Sign in required." }, 401);
  if (!(await isTenancyManager(jwt))) {
    log("warn", "validate_theme_refused", {});
    return json({ error: "Not authorized." }, 403);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Body must be JSON." }, 400);
  }

  const result = validateThemeRequest(body);
  if (!result.ok) {
    return json({ error: result.error, failures: result.failures ?? [] }, result.status);
  }

  const { brand_id, market_code } = body as { brand_id: string; market_code: string };
  const supabase = createClient(env.values.SUPABASE_URL!, env.values.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

  const { data, error } = await supabase
    .from("brand_themes")
    .upsert({ brand_id, market_code, ...result.theme }, { onConflict: "brand_id,market_code" })
    .select()
    .abortSignal(AbortSignal.timeout(10_000))
    .single();

  if (error) {
    // The database runs the same AA checks, so a rejection here means the two disagreed.
    log("error", "validate_theme_upsert_failed", { code: error.code });
    return json({ error: "Could not save the theme." }, 500);
  }

  return json({ theme: data }, 200);
});
