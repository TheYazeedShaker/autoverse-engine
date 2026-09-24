import { PostgrestClient } from "@supabase/postgrest-js";
import { describe, expect, it } from "vitest";
import { EVENTS_UPSERT_OPTIONS } from "./ingest";

// This checks the request the handler actually sends, not a hand-written copy of it. The earlier
// SQL test used `DO NOTHING` while the code emitted `DO UPDATE`, which is how the bug went unseen.
// Here the real PostgREST client builds the request, and supabase/tests/0008 proves what each
// resolution does against the write-once trigger.
async function captureUpsert(): Promise<{ url: URL; prefer: string }> {
  let captured: { url: URL; prefer: string } | undefined;
  const fetchSpy: typeof fetch = async (input, init) => {
    const headers = new Headers(init?.headers);
    captured = { url: new URL(String(input)), prefer: headers.get("prefer") ?? "" };
    return new Response("[]", { status: 201, headers: { "content-type": "application/json" } });
  };
  const client = new PostgrestClient("http://postgrest.test", { fetch: fetchSpy });
  await client.from("events").upsert([{ id: "x" }], EVENTS_UPSERT_OPTIONS);
  if (!captured) throw new Error("no request was sent");
  return captured;
}

describe("events upsert", () => {
  it("resolves a conflict on id by ignoring the duplicate (ON CONFLICT DO NOTHING)", async () => {
    const { url, prefer } = await captureUpsert();
    expect(url.searchParams.get("on_conflict")).toBe("id");
    expect(prefer).toContain("resolution=ignore-duplicates");
    expect(prefer).not.toContain("resolution=merge-duplicates");
  });
});
