import { FLAGS, isFlagEnabled } from "../../../lib/flags";

// Liveness for the post-deploy smoke test (.github/workflows/smoke.yml). `sha` lets the smoke test
// prove the NEW deploy is the one being served. Build details sit behind the `health_build_info`
// flag — the flag used to exercise create → off → on → kill end to end (REV2 0-H.6).
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA ?? "dev";
  const body: Record<string, unknown> = { status: "ok", sha };
  if (await isFlagEnabled(FLAGS.healthBuildInfo, "engine-health")) {
    body.build = {
      time: process.env.BUILD_TIME ?? null,
      env: process.env.VERCEL_ENV ?? "development",
    };
  }
  return Response.json(body, { headers: { "cache-control": "no-store" } });
}
