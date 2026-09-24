// One worker run from Node, against the Supabase API the environment names. The phase gate uses it
// to have the real worker, over the real store, do the replay. The key is the service role, read
// from the environment and never printed. It accepts the edge-runtime names (SUPABASE_URL and the
// service-role key variable) or the ones `supabase status -o env` prints (API_URL, SERVICE_ROLE_KEY).
import { createClient } from "@supabase/supabase-js";
import { supabaseStore } from "./supabase-store.ts";
import { runOnce } from "./worker.ts";

const url = process.env.SUPABASE_URL ?? process.env.API_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("an API URL and a service-role key are required (see the header)");
  process.exit(1);
}

const client = createClient(url, key, { auth: { persistSession: false } });
const summary = await runOnce(supabaseStore(client), { budgetMs: 20_000 });
console.warn(JSON.stringify({ event: "run_once_summary", ...summary }));
