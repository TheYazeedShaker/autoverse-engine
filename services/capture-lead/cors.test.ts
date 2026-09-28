import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CAPTURE_REQUEST_HEADERS, corsHeaders, preflightResponse } from "../shared/cors";

describe("preflightResponse", () => {
  it("allows POST with exactly the page contract's headers, and nothing credentialed", () => {
    const res = preflightResponse();
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("access-control-allow-methods")).toBe("POST, OPTIONS");
    const allowed = res.headers.get("access-control-allow-headers")?.split(", ");
    expect(allowed).toEqual([...CAPTURE_REQUEST_HEADERS]);
    expect(allowed).toContain("x-autoverse-key");
    expect(allowed).toContain("x-autoverse-market");
    // `*` and credentials can't go together, and these functions read no cookies.
    expect(res.headers.get("access-control-allow-credentials")).toBeNull();
    expect(Number(res.headers.get("access-control-max-age"))).toBeGreaterThan(0);
  });

  it("never lets a page send an Authorization header or a key by another name", () => {
    expect(CAPTURE_REQUEST_HEADERS).not.toContain("authorization");
    expect(CAPTURE_REQUEST_HEADERS).not.toContain("apikey");
  });
});

describe("corsHeaders", () => {
  it("lets the page read any answer, refusals included", () => {
    expect(corsHeaders()).toEqual({ "access-control-allow-origin": "*" });
  });
});

// index.ts calls Deno.serve, so it can't be imported here. Check the wiring in its source instead:
// the preflight is answered first (before the config check, which would turn it into a 503, and
// the caller check, which a preflight can't pass); every JSON answer carries the CORS header; and
// an unexpected throw still leaves through json(). These match source text, so a reformat of these
// lines can break them: fix the pattern, not the wiring.
// ingest-event is checked from here because it shares cors.ts and has the same shape.
describe.each(["../capture-lead/index.ts", "../ingest-event/index.ts"])("%s", (path) => {
  const source = readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
  const at = (needle: string) => {
    const i = source.indexOf(needle);
    expect(i, needle).toBeGreaterThan(-1);
    return i;
  };

  it("answers OPTIONS with the preflight before anything else", () => {
    const options = at('request.method === "OPTIONS") return preflightResponse()');
    expect(options).toBeGreaterThan(at("Deno.serve("));
    expect(options).toBeLessThan(at("requireEnv("));
    expect(options).toBeLessThan(at("readPublicCaller(request.headers)"));
    expect(options).toBeLessThan(at('request.method !== "POST"'));
  });

  it("puts the CORS header on every JSON answer", () => {
    expect(source).toMatch(/headers: \{[^}]*\.\.\.corsHeaders\(\)[^}]*\}/);
    expect(source.match(/new Response\(/g)).toHaveLength(1);
  });

  it("answers an unexpected throw through json() with a logged 503, never the runtime's 500", () => {
    expect(source).toMatch(
      /try \{\s*return await handle\(request, traceId\);\s*\} catch \(error\) \{[\s\S]*?_unhandled_error[\s\S]*?return json\([\s\S]*?503\)/,
    );
  });

  it("takes the trace id only through readTraceId", () => {
    expect(source).toContain("const traceId = readTraceId(request.headers);");
    expect(source).not.toContain('headers.get("x-trace-id")');
  });
});
