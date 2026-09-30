// Tests for .github/workflows/demo-sync.yml (run: node --test .github/scripts/demo-sync/sync.test.mjs).
//
// The workflow's two shell steps are run as they are written, with bash, against fake `gh`,
// `timeout`, `sleep` and `curl` programs put first on PATH. The fake `gh` answers only the exact
// calls the workflow is meant to make; anything else fails the test. No dependencies: the YAML
// is read as text. `jq` is real when installed (the CI runner) and a small stand-in otherwise.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";

const WORKFLOW = new URL("../../workflows/demo-sync.yml", import.meta.url);
const TEXT = readFileSync(WORKFLOW, "utf8").replace(/\r\n/g, "\n");
const LINES = TEXT.split(/\r?\n/);

const MAIN = "a".repeat(40);
const DEMO = "b".repeat(40);
const OTHER = "c".repeat(40);
const REPO = "owner/repo";

/** The `run: |` block that follows the first line matching `marker`, with its indent removed. */
function runBlock(marker) {
  const start = LINES.findIndex((l) => marker.test(l));
  assert.ok(start >= 0, `no line matches ${marker}`);
  const runAt = LINES.findIndex((l, i) => i > start && /^\s+run: \|\s*$/.test(l));
  assert.ok(runAt > start, `no run block after ${marker}`);
  const indent = LINES[runAt].search(/\S/) + 2;
  const out = [];
  for (let i = runAt + 1; i < LINES.length; i++) {
    const line = LINES[i];
    if (line.trim() !== "" && line.search(/\S/) < indent) break;
    out.push(line.slice(indent));
  }
  return out.join("\n");
}

/** The lines of one job, from `  <name>:` to the next job. */
function jobBlock(name) {
  const start = LINES.indexOf(`  ${name}:`);
  assert.ok(start >= 0, `no job ${name}`);
  let end = LINES.findIndex((l, i) => i > start && /^ {2}[a-z][\w-]*:\s*$/.test(l));
  if (end < 0) end = LINES.length;
  return LINES.slice(start, end).join("\n");
}

const SYNC = runBlock(/^\s+id: sync\s*$/);
const ALERT = runBlock(/^\s+- name: Post the failure to Slack\s*$/);

const FAKE_GH = `#!/usr/bin/env bash
echo "$*" >> "$FAKE_LOG"
case "$*" in
  "api -X PATCH repos/${REPO}/git/refs/heads/demo -f sha=$FAKE_MAIN -F force=false --jq .object.sha")
    case "$FAKE_PATCH" in
      ok) echo "$FAKE_MAIN" ;;
      other) echo "${OTHER}" ;;
      workflows) echo "gh: refusing to allow a GitHub App to create or update workflow .github/workflows/x.yml without \\\`workflows\\\` permission (HTTP 422)" >&2; exit 1 ;;
      *) echo "gh: Update is not a fast forward (HTTP 422)" >&2; exit 1 ;;
    esac ;;
  "api repos/${REPO}/git/ref/heads/main --jq .object.sha")
    if [ -n "\${FAKE_MAIN_FLAKY:-}" ]; then
      n=$(cat "$FAKE_STATE" 2>/dev/null || echo 0); n=$((n + 1)); echo "$n" > "$FAKE_STATE"
      if [ "$n" -le "$FAKE_MAIN_FLAKY" ]; then echo "gh: Bad Gateway (HTTP 502)" >&2; exit 1; fi
    fi
    echo "$FAKE_MAIN" ;;
  "api repos/${REPO}/git/ref/heads/demo --jq .object.sha")
    case "$FAKE_DEMO" in
      404) echo "gh: Not Found (HTTP 404)" >&2; exit 1 ;;
      ERR) echo "gh: Server Error (HTTP 500)" >&2; exit 1 ;;
      *) echo "$FAKE_DEMO" ;;
    esac ;;
  "api repos/${REPO}/compare/$FAKE_DEMO...$FAKE_MAIN --jq .status")
    echo "$FAKE_STATUS" ;;
  "api repos/${REPO}/commits/$FAKE_MAIN --jq .parents[0].sha")
    case "\${FAKE_PARENT:-}" in
      ERR) echo "gh: Server Error (HTTP 500)" >&2; exit 1 ;;
      *) echo "\${FAKE_PARENT:-$FAKE_DEMO}" ;;
    esac ;;
  *) echo "UNEXPECTED $*" >> "$FAKE_LOG"; echo "unexpected gh call: $*" >&2; exit 99 ;;
esac
`;

// Logs each call's limit, then runs the command, unless FAKE_HANG matches it (then: exit 124,
// what coreutils timeout returns when it kills a command).
const FAKE_TIMEOUT = `#!/usr/bin/env bash
echo "$1" >> "$FAKE_TIMEOUTS"
shift
if [ -n "\${FAKE_HANG:-}" ] && [[ "$*" == *"$FAKE_HANG"* ]]; then exit 124; fi
exec "$@"
`;

const FAKE_SLEEP = `#!/usr/bin/env bash
echo "$1" >> "$FAKE_SLEEPS"
`;

// Answers from FAKE_CURL_CODES (comma-separated, one per call); writes -o and -D files.
const FAKE_CURL = `#!/usr/bin/env bash
echo "$*" >> "$FAKE_LOG"
out=""; hdr=""; data=""
while [ $# -gt 0 ]; do
  case "$1" in
    -o) out="$2"; shift ;;
    -D) hdr="$2"; shift ;;
    --data) data="$2"; shift ;;
  esac
  shift
done
printf '%s' "$data" > "$FAKE_BODY"
n=$(cat "$FAKE_STATE" 2>/dev/null || echo 0); n=$((n + 1)); echo "$n" > "$FAKE_STATE"
IFS=, read -ra codes <<< "$FAKE_CURL_CODES"
code="\${codes[$((n - 1))]:-000}"
if [ -n "\${FAKE_RETRY_AFTER:-}" ]; then
  printf 'HTTP/2 %s\\r\\nretry-after: %s\\r\\n\\r\\n' "$code" "$FAKE_RETRY_AFTER" > "$hdr"
else
  printf 'HTTP/2 %s\\r\\n\\r\\n' "$code" > "$hdr"
fi
body="\${FAKE_SLACK_BODY:-}"
[ -n "$body" ] || body='{"ok":true}'
printf '%s' "$body" > "$out"
printf '%s' "$code"
`;

// Stand-in for the three jq forms the alert uses, for machines without jq (the CI runner has it).
const FAKE_JQ = `#!/usr/bin/env bash
exec node -e '
const a = process.argv.slice(1);
const fs = require("fs");
if (a[0] === "-n") {
  const vars = {}; let i = 1;
  while (a[i] === "--arg") { vars[a[i + 1]] = a[i + 2]; i += 3; }
  // Only flat object filters: {key: $var, key: true|false}.
  const obj = {};
  for (const part of a[i].trim().replace(/^\\{|\\}$/g, "").split(",")) {
    const [k, v] = part.split(":").map((x) => x.trim());
    obj[k] = v.startsWith("$") ? vars[v.slice(1)] : JSON.parse(v);
  }
  process.stdout.write(JSON.stringify(obj));
} else if (a[0] === "-e") {
  process.exit(JSON.parse(fs.readFileSync(a[2], "utf8")).ok === true ? 0 : 1);
} else if (a[0] === "-r") {
  process.stdout.write(String(JSON.parse(fs.readFileSync(a[2], "utf8")).error ?? "unknown") + "\\n");
} else { process.exit(98); }
' -- "$@"
`;

const HAS_JQ = spawnSync("bash", ["-c", "command -v jq"], { encoding: "utf8" }).status === 0;

function run(script, env) {
  const dir = mkdtempSync(join(tmpdir(), "demo-sync-test-"));
  const bin = join(dir, "bin");
  mkdirSync(bin);
  const fakes = { gh: FAKE_GH, timeout: FAKE_TIMEOUT, sleep: FAKE_SLEEP, curl: FAKE_CURL };
  if (!HAS_JQ) fakes.jq = FAKE_JQ;
  for (const [name, body] of Object.entries(fakes)) {
    writeFileSync(join(bin, name), body);
    chmodSync(join(bin, name), 0o755);
  }
  const files = {};
  for (const name of ["output", "summary", "log", "timeouts", "sleeps", "body"]) {
    files[name] = join(dir, name);
    writeFileSync(files[name], "");
  }
  const base = Object.fromEntries(
    Object.entries(process.env).filter(([k]) => k.toUpperCase() !== "PATH"),
  );
  const r = spawnSync("bash", ["-c", script], {
    cwd: dir,
    encoding: "utf8",
    env: {
      ...base,
      PATH: `${bin}${delimiter}${process.env.PATH ?? process.env.Path ?? ""}`,
      GITHUB_OUTPUT: files.output,
      GITHUB_STEP_SUMMARY: files.summary,
      REPO,
      TRIGGER_SHA: "d".repeat(40),
      GH_TOKEN: "test-token",
      ALERT_DRILL: "false",
      FAKE_LOG: files.log,
      FAKE_TIMEOUTS: files.timeouts,
      FAKE_SLEEPS: files.sleeps,
      FAKE_BODY: files.body,
      FAKE_STATE: join(dir, "state"),
      FAKE_MAIN: MAIN,
      FAKE_DEMO: DEMO,
      ...env,
    },
  });
  const read = (f) => readFileSync(files[f], "utf8");
  const calls = read("log").split("\n").filter(Boolean);
  return {
    status: r.status,
    stdout: r.stdout,
    stderr: r.stderr,
    outcome: /^outcome=(.*)$/m.exec(read("output"))?.[1],
    summary: read("summary"),
    calls,
    patches: calls.filter((c) => c.includes("-X PATCH")),
    timeouts: read("timeouts").split("\n").filter(Boolean),
    sleeps: read("sleeps").split("\n").filter(Boolean),
    body: read("body"),
  };
}

function assertNoUnexpected(r) {
  assert.deepEqual(
    r.calls.filter((c) => c.startsWith("UNEXPECTED")),
    [],
    r.stderr,
  );
}

function assertFailed(r, outcome) {
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.equal(r.outcome, outcome);
  assert.match(r.stdout, /::error title=demo was not synced::/);
  assert.match(r.summary, new RegExp(`demo was NOT synced \\(${outcome}\\)`));
}

// --- the sync step ---------------------------------------------------------------------------

test("demo behind main: fast-forwards with force=false, to main's tip", () => {
  const r = run(SYNC, { FAKE_STATUS: "ahead", FAKE_PATCH: "ok" });
  assertNoUnexpected(r);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(r.outcome, "fast_forwarded");
  assert.equal(r.patches.length, 1);
  assert.match(r.patches[0], new RegExp(`sha=${MAIN} -F force=false`));
  assert.doesNotMatch(r.stdout, /::warning/);
  assert.match(r.summary, /demo fast-forwarded/);
});

test("it syncs to main's current tip, not to the commit that triggered the run", () => {
  const r = run(SYNC, { FAKE_STATUS: "ahead", FAKE_PATCH: "ok", TRIGGER_SHA: OTHER });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.patches[0], new RegExp(`sha=${MAIN} `));
  assert.ok(!r.calls.some((c) => c.includes(OTHER)), "the trigger sha was used in an API call");
});

test("identical: nothing is written", () => {
  const r = run(SYNC, { FAKE_STATUS: "identical" });
  assertNoUnexpected(r);
  assert.equal(r.status, 0);
  assert.equal(r.outcome, "unchanged");
  assert.equal(r.patches.length, 0);
});

for (const [status, outcome] of [
  ["behind", "demo_ahead"],
  ["diverged", "diverged"],
  ["weird", "api_error"],
]) {
  test(`compare says ${status}: fails as ${outcome}, nothing is written`, () => {
    const r = run(SYNC, { FAKE_STATUS: status, FAKE_PATCH: "ok" });
    assertNoUnexpected(r);
    assertFailed(r, outcome);
    assert.equal(r.patches.length, 0);
  });
}

test("demo missing: fails as missing at once (a 404 is not retried), nothing is written", () => {
  const r = run(SYNC, { FAKE_DEMO: "404", FAKE_STATUS: "ahead", FAKE_PATCH: "ok" });
  assertFailed(r, "missing");
  assert.equal(r.calls.filter((c) => c.includes("heads/demo")).length, 1);
  assert.equal(r.patches.length, 0);
});

test("a failing read is tried 3 times, then fails as api_error", () => {
  const r = run(SYNC, { FAKE_DEMO: "ERR", FAKE_STATUS: "ahead" });
  assertFailed(r, "api_error");
  assert.equal(r.calls.filter((c) => c.includes("heads/demo")).length, 3);
  assert.equal(r.patches.length, 0);
});

test("a flaky read recovers within its retries", () => {
  const r = run(SYNC, { FAKE_MAIN_FLAKY: "2", FAKE_STATUS: "ahead", FAKE_PATCH: "ok" });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(r.outcome, "fast_forwarded");
  assert.equal(r.calls.filter((c) => c.includes("heads/main")).length, 3);
});

test("a read that times out is retried and reported as a timeout", () => {
  const r = run(SYNC, { FAKE_HANG: "git/ref/heads/demo", FAKE_STATUS: "ahead" });
  assertFailed(r, "api_error");
  assert.equal((r.stderr.match(/read attempt \d failed: timed out after 20 s/g) ?? []).length, 3);
  assert.deepEqual(r.sleeps, ["5", "10"]);
  assert.equal(r.patches.length, 0);
});

test("a refused move (not a fast-forward) fails as refused and is not retried", () => {
  const r = run(SYNC, { FAKE_STATUS: "ahead", FAKE_PATCH: "422" });
  assertFailed(r, "refused");
  assert.equal(r.patches.length, 1);
});

test("a refusal over the workflows permission says the owner moves demo by hand", () => {
  const r = run(SYNC, { FAKE_STATUS: "ahead", FAKE_PATCH: "workflows" });
  assertFailed(r, "refused");
  assert.match(r.stdout, /owner moves demo once by hand/);
  assert.equal(r.patches.length, 1);
});

test("a move that times out is reported as unknown (api_error), not as refused", () => {
  const r = run(SYNC, { FAKE_STATUS: "ahead", FAKE_PATCH: "ok", FAKE_HANG: "-X PATCH" });
  assertFailed(r, "api_error");
  assert.match(r.stdout, /may or may not have applied it/);
});

test("a move that lands on another sha fails", () => {
  const r = run(SYNC, { FAKE_STATUS: "ahead", FAKE_PATCH: "other" });
  assertFailed(r, "api_error");
});

for (const [who, env] of [
  ["main", { FAKE_MAIN: "not-a-sha" }],
  ["demo", { FAKE_DEMO: "zzz" }],
]) {
  test(`${who} resolving to junk fails before any write`, () => {
    const r = run(SYNC, { FAKE_STATUS: "ahead", FAKE_PATCH: "ok", ...env });
    assertFailed(r, "api_error");
    assert.equal(r.patches.length, 0);
  });
}

test("a jump over several merges succeeds with a Vercel warning", () => {
  const r = run(SYNC, { FAKE_STATUS: "ahead", FAKE_PATCH: "ok", FAKE_PARENT: OTHER });
  assertNoUnexpected(r);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(r.outcome, "fast_forwarded");
  assert.match(r.stdout, /::warning title=demo jumped over several merges::/);
  assert.match(r.summary, /Check Vercel/);
});

test("the jump hint is skipped quietly when its read fails", () => {
  const r = run(SYNC, { FAKE_STATUS: "ahead", FAKE_PATCH: "ok", FAKE_PARENT: "ERR" });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(r.outcome, "fast_forwarded");
  assert.doesNotMatch(r.stdout, /::warning/);
});

test("the alert drill fails before any API call", () => {
  const r = run(SYNC, { ALERT_DRILL: "true", FAKE_STATUS: "ahead", FAKE_PATCH: "ok" });
  assertFailed(r, "drill");
  assert.equal(r.calls.length, 0);
});

test("every API call runs under a timeout", () => {
  const r = run(SYNC, { FAKE_STATUS: "ahead", FAKE_PATCH: "ok", FAKE_PARENT: OTHER });
  const gh = r.calls.filter((c) => !c.startsWith("UNEXPECTED")).length;
  assert.equal(r.timeouts.length, gh);
});

test("the worst case of the calls fits inside the step's time limit", () => {
  const limits = [...SYNC.matchAll(/\btimeout (\d+) gh\b/g)].map((m) => Number(m[1]));
  assert.ok(limits.length >= 2, "expected per-call timeouts");
  const perCall = Math.max(...limits);
  const reads = (SYNC.match(/\bread_api "repos\//g) ?? []).length;
  const writes = (SYNC.match(/gh api -X PATCH/g) ?? []).length;
  const attempts = 3;
  const sleeps = 5 + 10; // `sleep $((attempt * 5))` between attempts, none after the last
  assert.match(SYNC, /for attempt in 1 2 3; do/);
  assert.match(SYNC, /if \[ "\$attempt" -lt 3 \]; then sleep \$\(\(attempt \* 5\)\); fi/);
  const worst = reads * (attempts * perCall + sleeps) + writes * perCall;
  const step = /id: sync\s*\n(?:.*\n)*?\s+timeout-minutes: (\d+)/.exec(TEXT);
  assert.ok(step, "the sync step needs its own timeout-minutes");
  assert.ok(
    worst + 30 < Number(step[1]) * 60,
    `worst case ${worst} s vs the step's ${step[1]} min`,
  );
  const job = /^ {4}timeout-minutes: (\d+)/m.exec(jobBlock("sync"));
  assert.ok(job && Number(job[1]) > Number(step[1]), "the job's limit must exceed the step's");
});

// --- the alert step --------------------------------------------------------------------------

const ALERT_ENV = {
  SLACK_BOT_TOKEN: "xoxb-test",
  CHANNEL: "C123",
  OUTCOME: "diverged",
  SYNC_RESULT: "failure",
  RUN_URL: "https://example.test/run/1",
};

test("alert: posts once, without link previews, and names the outcome", () => {
  const r = run(ALERT, { ...ALERT_ENV, FAKE_CURL_CODES: "200" });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const body = JSON.parse(r.body);
  assert.equal(body.channel, "C123");
  assert.match(body.text, /Demo sync failed \(diverged\)/);
  assert.equal(body.unfurl_links, false);
  assert.equal(body.unfurl_media, false);
  assert.ok(body.text.includes(ALERT_ENV.RUN_URL), "the alert links the run");
  assert.equal(r.calls.length, 1);
  assert.match(r.calls[0], /--max-time 10\b/);
});

test("alert: a drill says it is a drill, not an incident", () => {
  const r = run(ALERT, { ...ALERT_ENV, OUTCOME: "drill", FAKE_CURL_CODES: "200" });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const text = JSON.parse(r.body).text;
  assert.match(text, /alert drill/);
  assert.doesNotMatch(text, /no longer follows main/);
});

test("alert: without an outcome (the step hit its limit) it names the job result", () => {
  const r = run(ALERT, { ...ALERT_ENV, OUTCOME: "", FAKE_CURL_CODES: "200" });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(JSON.parse(r.body).text, /Demo sync failed \(failure\)/);
});

test("alert: a 429 is retried once after Retry-After", () => {
  const r = run(ALERT, { ...ALERT_ENV, FAKE_CURL_CODES: "429,200", FAKE_RETRY_AFTER: "2" });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(r.calls.length, 2);
  assert.deepEqual(r.sleeps, ["2"]);
});

test("alert: a long Retry-After is capped at 30 s", () => {
  const r = run(ALERT, { ...ALERT_ENV, FAKE_CURL_CODES: "429,200", FAKE_RETRY_AFTER: "120" });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.deepEqual(r.sleeps, ["30"]);
});

test("alert: a 429 without Retry-After waits 5 s and posts on the second try", () => {
  const r = run(ALERT, { ...ALERT_ENV, FAKE_CURL_CODES: "429,200" });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(r.calls.length, 2);
  assert.deepEqual(r.sleeps, ["5"]);
});

for (const code of ["500", "503"]) {
  test(`alert: HTTP ${code} fails visibly and is not retried`, () => {
    const r = run(ALERT, { ...ALERT_ENV, FAKE_CURL_CODES: `${code},200` });
    assert.equal(r.status, 1);
    assert.match(r.stdout, new RegExp(`::error::Slack answered HTTP ${code}`));
    assert.equal(r.calls.length, 1);
  });
}

test("alert: Slack's ok=false fails visibly", () => {
  const r = run(ALERT, {
    ...ALERT_ENV,
    FAKE_CURL_CODES: "200",
    FAKE_SLACK_BODY: '{"ok":false,"error":"not_in_channel"}',
  });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /Slack refused the alert: not_in_channel/);
});

for (const missing of ["CHANNEL", "SLACK_BOT_TOKEN"]) {
  test(`alert: without ${missing} it fails visibly and posts nothing`, () => {
    const r = run(ALERT, { ...ALERT_ENV, [missing]: "", FAKE_CURL_CODES: "200" });
    assert.equal(r.status, 1);
    assert.match(r.stdout, /::error::No Slack alert was sent/);
    assert.equal(r.calls.length, 0);
  });
}

// --- the workflow's shape --------------------------------------------------------------------

test("shape: least privilege, no third-party code, never forced", () => {
  assert.match(TEXT, /^permissions: \{\}$/m);
  assert.match(jobBlock("sync"), /^ {4}permissions:\n {6}contents: write$/m);
  assert.match(jobBlock("alert"), /^ {4}permissions: \{\}$/m);
  assert.doesNotMatch(
    TEXT,
    /^\s+(?:- )?uses:/m,
    "no actions, so no checkout and no third-party code",
  );
  assert.doesNotMatch(TEXT, /force=true|--force|\+refs\//);
  assert.doesNotMatch(TEXT, /-X DELETE/);
  // Expressions reach the shell only through env, never inside a run block.
  assert.doesNotMatch(SYNC + ALERT, /\$\{\{/);
});

test("shape: triggers are pushes to main and manual runs only", () => {
  const on = /^on:\n((?: {2}.*\n|\n)*)/m.exec(TEXT)[1];
  assert.match(on, /^ {2}push:\n {4}branches: \[main\]$/m);
  assert.match(on, /^ {2}workflow_dispatch:/m);
  assert.doesNotMatch(on, /pull_request|schedule|workflow_run/);
});

test("shape: the alert runs on any sync result but success, and not for a cancelled run", () => {
  assert.match(
    jobBlock("alert"),
    /^ {4}if: \$\{\{ !cancelled\(\) && needs\.sync\.result != 'success' \}\}$/m,
  );
  assert.match(jobBlock("alert"), /^ {4}needs: sync$/m);
});

test("shape: one sync at a time, never cancelling a sync in progress; drills apart", () => {
  assert.match(
    TEXT,
    /^concurrency:\n {2}group: \$\{\{ inputs\.alert_drill && 'demo-sync-drill' \|\| 'demo-sync' \}\}\n {2}cancel-in-progress: false$/m,
  );
});
