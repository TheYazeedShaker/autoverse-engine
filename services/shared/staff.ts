// Deno-only (npm: specifier), so it's typechecked by the Supabase CLI at deploy time, like the
// edge function entrypoints that import it.
//
// Is this JWT a superadmin or ops user? That is the scope of app_auth.can_manage_tenancy(), and the
// owner's rule for who may write brand configuration or trigger operational work by hand. It runs
// AS the user, so RLS decides what the lookup can see (a user reads only their own profile).
import { createClient } from "npm:@supabase/supabase-js@2";
import { MANAGER_ROLES } from "./auth.ts";

export async function isTenancyManager(jwt: string): Promise<boolean> {
  const asUser = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${jwt}` } } },
  );
  const { data: user, error } = await asUser.auth.getUser(jwt);
  if (error || !user.user) return false;
  const { data: profile } = await asUser
    .from("profiles")
    .select("platform_role")
    .eq("id", user.user.id)
    .maybeSingle();
  return (MANAGER_ROLES as readonly string[]).includes(String(profile?.platform_role));
}
