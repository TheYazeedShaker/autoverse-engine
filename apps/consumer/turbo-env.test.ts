import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { z } from "zod";

// Turbo runs in strict env mode: a variable the consumer's build doesn't declare in
// apps/consumer/turbo.json is FILTERED OUT of the build process (Vercel only warns). This test
// fails CI, where `pnpm test` runs it, when the consumer, or a workspace package it bundles, reads
// a variable that isn't declared.
//
// Where a variable belongs:
//   env             read at BUILD time, so it changes the output (next.config, inlined values):
//                   part of Turbo's cache key. NEXT_PUBLIC_* would reach the build anyway through
//                   Turbo's Next.js inference; they are declared explicitly so they stay in the key
//                   on purpose.
//   passThroughEnv  read at RUNTIME only (server code): available, but it doesn't bust the cache.
//
// Known blind spot: a build plugin reading variables implicitly, e.g. the Sentry plugin's
// SENTRY_AUTH_TOKEN / SENTRY_ORG / SENTRY_PROJECT once source-map upload is turned on. Declare
// those by hand when that happens (noted in next.config.js).

const APP = fileURLToPath(new URL(".", import.meta.url));
const ROOT = join(APP, "../..");
/** Workspace packages the consumer bundles (next.config.js transpilePackages). */
const BUNDLED_PACKAGES = [
  "packages/engine-core",
  "packages/ui",
  "packages/types",
  "packages/design-tokens",
];

/** Read but deliberately not declared, each for a stated reason. */
const NOT_FROM_THE_ENVIRONMENT: Record<string, string> = {
  NODE_ENV: "set by Next itself for each command",
  NEXT_RUNTIME: "set by Next itself inside the server runtime",
  BUILD_TIME: "defined in next.config.js `env`, not read from the environment",
  SHOWROOM_SOURCE:
    "local development only; kept out of the build as a second layer (source.ts refuses the fixture on any deployment)",
};

const TurboConfig = z.object({
  globalEnv: z.array(z.string()).optional(),
  globalPassThroughEnv: z.array(z.string()).optional(),
  tasks: z
    .record(
      z.string(),
      z.object({
        env: z.array(z.string()).optional(),
        passThroughEnv: z.array(z.string()).optional(),
      }),
    )
    .optional(),
});

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if ([".next", "node_modules", ".turbo", "coverage", "storybook-static"].includes(entry.name)) {
      continue;
    }
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(path));
    else if (
      /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(entry.name) &&
      !/\.(test|stories)\.(ts|tsx|js|jsx)$/.test(entry.name)
    ) {
      out.push(path);
    }
  }
  return out;
}

const NAME = "[A-Z][A-Z0-9_]*";

/** Every environment variable name the source reads, with the files that read it. */
export function envReads(files: { path: string; text: string }[]): Map<string, string[]> {
  const direct = [
    new RegExp(`process\\.env\\??\\.(${NAME})`, "g"),
    new RegExp(`process\\.env\\??\\.?\\[\\s*["'\`](${NAME})["'\`]\\s*\\]`, "g"),
    // `env.NAME` / `env["NAME"]` on a record passed around (configuredCatalogSource(env = process.env)).
    // Upper-case names only, so ordinary objects called `env` with lower-case keys don't count.
    new RegExp(`\\benv\\??\\.(${NAME})\\b`, "g"),
    new RegExp(`\\benv\\??\\.?\\[\\s*["'\`](${NAME})["'\`]\\s*\\]`, "g"),
  ];
  // `const { A, B: b, C = "x" } = process.env` (or `= env`).
  const destructure = /\{([^{}]*)\}\s*=\s*(?:process\.)?env\b/g;
  const reads = new Map<string, string[]>();
  const add = (name: string, path: string) =>
    reads.set(name, [...new Set([...(reads.get(name) ?? []), path])]);
  for (const { path, text } of files) {
    for (const re of direct) for (const m of text.matchAll(re)) add(m[1]!, path);
    for (const m of text.matchAll(destructure)) {
      for (const part of m[1]!.split(",")) {
        const key = part.split(/[:=]/)[0]!.trim();
        if (new RegExp(`^${NAME}$`).test(key)) add(key, path);
      }
    }
  }
  return reads;
}

function readTurbo(path: string) {
  return TurboConfig.parse(JSON.parse(readFileSync(path, "utf8")));
}

function declared(): Set<string> {
  const root = readTurbo(join(ROOT, "turbo.json"));
  const build = readTurbo(join(APP, "turbo.json")).tasks?.build ?? {};
  return new Set<string>([
    ...(root.globalEnv ?? []),
    ...(root.globalPassThroughEnv ?? []),
    ...(build.env ?? []),
    ...(build.passThroughEnv ?? []),
  ]);
}

describe("turbo env declarations", () => {
  it("declares every environment variable the consumer (and what it bundles) reads", () => {
    const dirs = [APP, ...BUNDLED_PACKAGES.map((p) => join(ROOT, p))];
    const files = dirs.flatMap((dir) =>
      sourceFiles(dir).map((path) => ({
        path: relative(ROOT, path),
        text: readFileSync(path, "utf8"),
      })),
    );
    const reads = envReads(files);
    const known = declared();
    const missing = [...reads.keys()]
      .filter((name) => !known.has(name) && !(name in NOT_FROM_THE_ENVIRONMENT))
      .map((name) => `${name} (read in ${reads.get(name)!.join(", ")})`);
    expect(
      missing,
      "Declare these in apps/consumer/turbo.json (build-time → env, runtime-only → passThroughEnv)",
    ).toEqual([]);
  });

  it("keeps SHOWROOM_SOURCE out of the build", () => {
    expect(declared().has("SHOWROOM_SOURCE")).toBe(false);
  });

  it("puts NEXT_PUBLIC_ variables in env: they are inlined at build time", () => {
    const passThrough = readTurbo(join(APP, "turbo.json")).tasks?.build?.passThroughEnv ?? [];
    expect(passThrough.filter((n) => n.startsWith("NEXT_PUBLIC_"))).toEqual([]);
  });

  it("finds reads in every form the code could use", () => {
    const reads = envReads([
      {
        path: "a.ts",
        text: [
          "process.env.ONE;",
          "process.env['TWO'];",
          "process.env?.THREE;",
          "env.FOUR;",
          'env["FIVE"];',
          "env.lower;",
          'const { SIX, SEVEN: seven, EIGHT = "x", other } = process.env;',
          "const { NINE } = env;",
        ].join("\n"),
      },
    ]);
    expect([...reads.keys()].sort()).toEqual([
      "EIGHT",
      "FIVE",
      "FOUR",
      "NINE",
      "ONE",
      "SEVEN",
      "SIX",
      "THREE",
      "TWO",
    ]);
  });
});
