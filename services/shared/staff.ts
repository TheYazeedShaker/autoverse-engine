// Deno-only (imports supabase-js through services/deno.json), typechecked by CI's deno job, like the
// edge function entrypoints that import it.
//
// Is this JWT a superadmin or ops user? That is the scope of app_auth.can_manage_tenancy(), and the
// owner's rule for who may write brand configuration or trigger operational work by hand. It runs
// AS the user, so RLS decides what the lookup can see (a user reads only their own profile).
// Fails closed: a missing setting, a timeout or any error means "no".
import { createClient } from "@supabase/supabase-js";
import { MANAGER_ROLES } from "./auth.ts";
import { withTimeout } from "./log.ts";

const TIMEOUT_MS = 5_000;

export async function isTenancyManager(jwt: string): Promise<boolean> {
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !anonKey) return false;
  try {
    const asUser = createClient(url, anonKey, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const { data: user, error } = await withTimeout(
      asUser.auth.getUser(jwt),
      TIMEOUT_MS,
      "getUser",
    );
    if (error || !user.user) return false;
    const { data: profile } = await asUser
      .from("profiles")
      .select("platform_role")
      .eq("id", user.user.id)
      .abortSignal(AbortSignal.timeout(TIMEOUT_MS))
      .maybeSingle();
    return (MANAGER_ROLES as readonly string[]).includes(String(profile?.platform_role));
  } catch {
    return false;
  }
}
