import { afterEach, describe, expect, it, vi } from "vitest";

const flag = vi.hoisted(() => ({ on: false }));
vi.mock("../../../lib/flags", () => ({
  FLAGS: { healthBuildInfo: "health_build_info" },
  isFlagEnabled: async () => flag.on,
}));

const { GET } = await import("./route");
const HEALTH_FLAG = "health_build_info";

afterEach(() => {
  flag.on = false;
  vi.unstubAllEnvs();
});

describe("GET /api/health", () => {
  it("reports ok and the deployed commit, uncached", async () => {
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "abc123");
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ status: "ok", sha: "abc123" });
  });

  it(`hides build details while ${HEALTH_FLAG} is off (the default, and the kill state)`, async () => {
    const body = await (await GET()).json();
    expect(body).not.toHaveProperty("build");
  });

  it(`shows build details only when ${HEALTH_FLAG} is on`, async () => {
    flag.on = true;
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("BUILD_TIME", "2026-09-21T00:00:00.000Z");
    const body = await (await GET()).json();
    expect(body.build).toEqual({ time: "2026-09-21T00:00:00.000Z", env: "production" });
  });
});
