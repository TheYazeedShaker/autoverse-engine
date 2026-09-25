// Publish job (fresh runner, checkout of main). The only code that holds the App token. The agent
// job had no GitHub write credential: it left commits in a git bundle and PR requests as JSON in
// its artifact. Everything in the artifact is untrusted data:
//   - only branches named agent/<slug> are pushed, never force, never deleted;
//   - PR titles and bodies are length-capped and sanitised;
//   - pause.json (spec §7 isolation failure) makes THIS job create loop/pause, so the agent can
//     neither skip the pause nor undo it (it never holds a token that could delete the branch).
// Sets outputs: paused, pushed, prs.
import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { sanitize } from "./outbox.mjs";
import { log, requireEnv } from "./slack.mjs";

const MAX_BRANCHES = 5;
const MAX_PRS = 5;

export const validBranch = (b) =>
  typeof b === "string" &&
  /^agent\/[a-z0-9][a-z0-9._/-]{0,80}$/.test(b) &&
  !b.includes("..") &&
  !b.endsWith("/") &&
  !b.endsWith(".lock");

// Every new commit must name the agent as author and committer, so the agent can't publish
// commits that claim to be the owner's. Input: `git log --format=%ae%x09%ce` lines.
export function foreignIdentities(logLines, email) {
  return logLines
    .split("\n")
    .filter(Boolean)
    .flatMap((l) => l.split("\t"))
    .filter((e) => e !== email);
}

export function validatePr(pr) {
  if (!pr || typeof pr !== "object") return "not an object";
  if (!validBranch(pr.branch)) return "branch must be agent/<slug>";
  if (typeof pr.title !== "string" || !pr.title.trim() || pr.title.length > 200)
    return "title must be 1-200 chars";
  if (typeof pr.body !== "string" || pr.body.length > 50_000) return "body must be ≤ 50000 chars";
  if (pr.draft !== undefined && typeof pr.draft !== "boolean") return "draft must be boolean";
  return null;
}

async function gh(method, pathname, token, body) {
  const res = await fetch("https://api.github.com" + pathname, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/vnd.github+json",
      "content-type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

function git(args, env = {}) {
  return execFileSync("git", args, {
    encoding: "utf8",
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function main() {
  const env = requireEnv(
    "GH_TOKEN",
    "GITHUB_REPOSITORY",
    "GITHUB_SHA",
    "GITHUB_OUTPUT",
    "AGENT_OUT",
    "AGENT_APP_LOGIN",
  );
  const agentEmail = `${env.AGENT_APP_LOGIN}@users.noreply.github.com`;
  const { GH_TOKEN: token, GITHUB_REPOSITORY: repo, AGENT_OUT: dir } = env;
  const out = { paused: "false", pushed: 0, prs: 0 };
  const finish = () =>
    appendFileSync(
      env.GITHUB_OUTPUT,
      Object.entries(out)
        .map(([k, v]) => `${k}=${v}\n`)
        .join(""),
    );

  if (existsSync(path.join(dir, "pause.json"))) {
    const r = await gh("POST", `/repos/${repo}/git/refs`, token, {
      ref: "refs/heads/loop/pause",
      sha: env.GITHUB_SHA,
    });
    if (r.status !== 201 && r.status !== 422) throw new Error(`creating loop/pause: ${r.status}`);
    out.paused = "true";
    log("error", "publish.paused", { note: "agent requested a pause; nothing else published" });
    return finish();
  }

  // Branches: fetch from the bundle into a private namespace, then push fast-forward only.
  const bundle = path.join(dir, "agent.bundle");
  const branches = [];
  if (existsSync(bundle)) {
    git([
      "-c",
      "transfer.fsckObjects=true",
      "fetch",
      "--no-tags",
      bundle,
      "refs/heads/agent/*:refs/bundle/agent/*",
    ]);
    const refs = git(["for-each-ref", "--format=%(refname)", "refs/bundle/agent/"])
      .split("\n")
      .filter(Boolean)
      .map((r) => r.replace(/^refs\/bundle\//, ""));
    for (const b of refs) {
      if (!validBranch(b) || branches.length >= MAX_BRANCHES) {
        log("warn", "publish.branch_rejected", { reason: "name or cap" });
        continue;
      }
      const ids = git(["log", "--format=%ae%x09%ce", `refs/bundle/${b}`, "--not", "origin/main"]);
      if (foreignIdentities(ids, agentEmail).length) {
        log("warn", "publish.branch_rejected", { branch: b, reason: "commit not by the agent" });
        continue;
      }
      branches.push(b);
    }
    const auth = Buffer.from(`x-access-token:${token}`).toString("base64");
    const authEnv = {
      GIT_CONFIG_COUNT: "1",
      GIT_CONFIG_KEY_0: "http.https://github.com/.extraheader",
      GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${auth}`,
    };
    for (const b of branches) {
      try {
        git(
          ["push", `https://github.com/${repo}.git`, `refs/bundle/${b}:refs/heads/${b}`],
          authEnv,
        );
        out.pushed++;
        log("info", "publish.pushed", { branch: b });
      } catch (err) {
        // Non-fast-forward, a workflow file (the App has no `workflows` permission), or a ruleset.
        log("error", "publish.push_failed", {
          branch: b,
          error: String(err.stderr ?? "").slice(0, 300),
        });
      }
    }
  }

  // Pull requests: create, or update the title and body of the open one.
  const prDir = path.join(dir, "prs");
  const files = existsSync(prDir)
    ? readdirSync(prDir)
        .filter((f) => f.endsWith(".json"))
        .sort()
    : [];
  const owner = repo.split("/")[0];
  for (const [i, f] of files.slice(0, MAX_PRS).entries()) {
    let pr;
    try {
      pr = JSON.parse(readFileSync(path.join(prDir, f), "utf8"));
    } catch {
      log("warn", "publish.pr_rejected", { n: i + 1, reason: "invalid JSON" });
      continue;
    }
    const reason = validatePr(pr);
    if (reason) {
      log("warn", "publish.pr_rejected", { n: i + 1, reason });
      continue;
    }
    const fields = { title: sanitize(pr.title), body: sanitize(pr.body) };
    const existing = await gh(
      "GET",
      `/repos/${repo}/pulls?state=open&head=${encodeURIComponent(`${owner}:${pr.branch}`)}`,
      token,
    );
    const r = existing.json?.[0]
      ? await gh("PATCH", `/repos/${repo}/pulls/${existing.json[0].number}`, token, fields)
      : await gh("POST", `/repos/${repo}/pulls`, token, {
          ...fields,
          head: pr.branch,
          base: "main",
          draft: pr.draft ?? false,
        });
    if (r.status >= 300) log("error", "publish.pr_failed", { n: i + 1, status: r.status });
    else {
      out.prs++;
      log("info", "publish.pr", { number: r.json.number, branch: pr.branch });
    }
  }
  finish();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    log("error", "publish.failed", { error: err.message });
    process.exit(1);
  });
}
