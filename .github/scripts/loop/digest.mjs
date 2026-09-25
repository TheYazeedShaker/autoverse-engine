// Morning digest (spec §6). Runs in the post job (a fresh runner on main, never the agent's
// workspace) on the digest schedule or a dispatch with digest=true, and posts to #build as the bot.
// CODEOWNERS and BACKLOG.md come from main; open decisions come from the inbox job's output; GitHub
// is read with the workflow's read-only token. Target: scannable in 60 seconds.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { sanitize } from "./outbox.mjs";
import { createSlack, log, requireEnv } from "./slack.mjs";

const GH = "https://api.github.com";
const DAY_MS = 86_400_000;

// ---- BACKLOG.md ----------------------------------------------------------------------------------

export function parseBacklog(md) {
  const rows = [];
  for (const line of md.split("\n")) {
    const cells = line.split("|").map((c) => c.trim());
    if (cells.length < 8 || !/^\d+$/.test(cells[1])) continue;
    rows.push({
      n: Number(cells[1]),
      id: cells[2],
      deps: cells[4],
      status: cells[5],
      notes: cells[6],
    });
  }
  return rows;
}

// The first queued task whose #n dependencies are all done (spec §2). Non-# deps don't block.
export function nextTask(rows) {
  const done = new Set(rows.filter((r) => r.status === "done").map((r) => r.n));
  return (
    rows.find(
      (r) =>
        r.status === "queued" &&
        [...r.deps.matchAll(/#(\d+)/g)].every((m) => done.has(Number(m[1]))),
    ) ?? null
  );
}

// ---- CODEOWNERS (the subset of gitignore syntax GitHub supports) ----------------------------------

export function parseCodeowners(text) {
  const rules = [];
  for (const raw of text.split("\n")) {
    const line = raw.replace(/\s+#.*$/, "").trim();
    if (!line || line.startsWith("#")) continue;
    const [pattern, ...owners] = line.split(/\s+/);
    rules.push({ pattern, owners, re: patternToRegex(pattern) });
  }
  return rules;
}

function patternToRegex(pattern) {
  let p = pattern;
  const dirOnly = p.endsWith("/");
  if (dirOnly) p = p.slice(0, -1);
  const anchored = p.startsWith("/") || p.includes("/");
  p = p.replace(/^\//, "");
  const body = p
    .split(/(\*\*|\*|\?)/)
    .map((t) =>
      t === "**"
        ? ".*"
        : t === "*"
          ? "[^/]*"
          : t === "?"
            ? "[^/]"
            : t.replace(/[.+^${}()|[\]\\]/g, "\\$&"),
    )
    .join("");
  return new RegExp(`${anchored ? "^" : "(^|.*/)"}${body}${dirOnly ? "/.+" : "(/.*)?"}$`);
}

// Last matching rule wins; a matching rule with no owners un-owns the path.
export function ownersOf(file, rules) {
  let owners = [];
  for (const r of rules) if (r.re.test(file)) owners = r.owners;
  return owners;
}

export const ownedFiles = (files, rules) => files.filter((f) => ownersOf(f, rules).length > 0);

// ---- formatting ----------------------------------------------------------------------------------

const link = (pr) => `<${pr.url}|#${pr.number}>`;
const clip = (s, n = 80) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

export function formatDigest(d) {
  const L = [`*Loop digest · ${d.date}*`, ""];
  const section = (title, items, empty = "none") => {
    L.push(`*${title}*`);
    if (!items.length) L.push(`• ${empty}`);
    else L.push(...items.map((i) => `• ${i}`));
    L.push("");
  };
  section(
    "Merged (24h)",
    d.merged.map((p) => `${link(p)} ${clip(p.title)}${p.byAgent ? "" : " _(owner)_"}`),
  );
  section(
    "Waiting on you",
    d.waiting.map(
      (p) =>
        `${link(p)} ${clip(p.title)} · human-tier: ${p.owned.slice(0, 3).join(", ")}${p.owned.length > 3 ? ` +${p.owned.length - 3}` : ""}`,
    ),
  );
  section(
    "Open decisions",
    d.decisions.map((q) => `${q.humanOnly ? "*HUMAN ONLY* " : ""}${clip(q.question, 100)}`),
  );
  section(
    "Failures (24h)",
    d.failures.map((f) => `<${f.url}|loop run ${f.id}> ${f.conclusion}`),
  );
  L.push(`*In progress:* ${d.inProgress.join(", ") || "none"}`);
  if (d.blocked.length) L.push(`*Blocked:* ${d.blocked.join(", ")}`);
  L.push(`*Next queued:* ${d.next ?? "nothing startable. Queue a task in BACKLOG.md"}`);
  if (d.paused) L.push("", "*Loop is PAUSED.*");
  return L.join("\n");
}

// ---- GitHub reads --------------------------------------------------------------------------------

async function gh(pathname, token) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(GH + pathname, {
        headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json" },
        signal: AbortSignal.timeout(10_000),
      });
      if (res.status >= 500 && attempt < 3) throw new Error(`http_${res.status}`);
      if (!res.ok)
        throw Object.assign(new Error(`GET ${pathname}: ${res.status}`), { final: true });
      return res.json();
    } catch (err) {
      if (err.final || attempt >= 3) throw err;
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    }
  }
}

async function main() {
  const env = requireEnv(
    "SLACK_BOT_TOKEN",
    "SLACK_BUILD_CHANNEL_ID",
    "GITHUB_TOKEN",
    "GITHUB_REPOSITORY",
  );
  const { GITHUB_TOKEN: token, GITHUB_REPOSITORY: repo } = env;
  const fromEnv = process.env.AGENT_APP_LOGIN ?? "";
  const agentLogin = /^[\w-]+\[bot\]$/.test(fromEnv) ? fromEnv : "autoverse-agent[bot]";
  const since = Date.now() - DAY_MS;
  const rules = parseCodeowners(readFileSync(".github/CODEOWNERS", "utf8"));

  const closed = await gh(
    `/repos/${repo}/pulls?state=closed&sort=updated&direction=desc&per_page=50`,
    token,
  );
  const merged = closed
    .filter((p) => p.merged_at && Date.parse(p.merged_at) >= since)
    .map((p) => ({
      number: p.number,
      url: p.html_url,
      title: p.title,
      byAgent: p.user.login === agentLogin,
    }));

  const open = await gh(`/repos/${repo}/pulls?state=open&per_page=50`, token);
  const waiting = [];
  for (const p of open.filter((p) => !p.draft)) {
    const files = await gh(`/repos/${repo}/pulls/${p.number}/files?per_page=100`, token);
    const owned = ownedFiles(
      files.map((f) => f.filename),
      rules,
    );
    // Owner-authored PRs are the owner's to merge; they're not waiting on anyone.
    if (owned.length && p.user.login === agentLogin)
      waiting.push({ number: p.number, url: p.html_url, title: p.title, owned });
  }

  const runs = await gh(
    `/repos/${repo}/actions/workflows/agent-loop.yml/runs?per_page=20&created=>=${new Date(since).toISOString()}`,
    token,
  );
  const failures = runs.workflow_runs
    .filter((r) => ["failure", "timed_out"].includes(r.conclusion))
    .map((r) => ({ id: r.id, url: r.html_url, conclusion: r.conclusion }));

  const rows = parseBacklog(readFileSync("BACKLOG.md", "utf8"));
  const next = nextTask(rows);
  const decisions = JSON.parse(process.env.INBOX_DECISIONS || "[]");

  const text = formatDigest({
    date: new Intl.DateTimeFormat("en-GB", {
      timeZone: "Africa/Cairo",
      dateStyle: "medium",
    }).format(new Date()),
    merged,
    waiting,
    decisions,
    failures,
    inProgress: rows.filter((r) => r.status === "in-progress").map((r) => r.id),
    blocked: rows.filter((r) => r.status === "blocked").map((r) => r.id),
    next: next?.id ?? null,
    paused: process.env.LOOP_PAUSED === "true",
  });
  await createSlack(env.SLACK_BOT_TOKEN).post(env.SLACK_BUILD_CHANNEL_ID, sanitize(text));
  log("info", "digest.posted", {
    merged: merged.length,
    waiting: waiting.length,
    failures: failures.length,
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    log("error", "digest.failed", { error: err.message });
    process.exit(1);
  });
}
