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
import { createClient } from "npm:@supabase/supabase-js@2";
import { isTenancyManager } from "../shared/staff.ts";
import { validateThemeRequest } from "./theme.ts";

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return json({ error: "Use POST." }, 405);

  const jwt = /^Bearer (.+)$/.exec(request.headers.get("authorization") ?? "")?.[1];
  if (!jwt || !(await isTenancyManager(jwt))) {
    console.warn(JSON.stringify({ level: "warn", event: "validate_theme_refused" }));
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
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  const { data, error } = await supabase
    .from("brand_themes")
    .upsert({ brand_id, market_code, ...result.theme }, { onConflict: "brand_id,market_code" })
    .select()
    .single();

  if (error) {
    // The database runs the same AA checks, so a rejection here means the two disagreed.
    console.error(
      JSON.stringify({ level: "error", event: "validate_theme_upsert_failed", code: error.code }),
    );
    return json({ error: "Could not save the theme." }, 500);
  }

  return json({ theme: data }, 200);
});
