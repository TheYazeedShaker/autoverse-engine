// Outbox poster. The agent never holds the Slack token: it writes .loop/outbox/*.json, the agent
// job passes them on as a job output ($OUTBOX_B64: base64 of a JSON array of each file's raw text),
// and the post job (a fresh runner) posts them as the bot. The entries are untrusted data:
// validated, capped and sanitised here. Each file is one message:
//   { "channel": "build" | "decisions", "text": "...", "thread_ts": "1727000000.000100" }
// Posts to #build-inbox are refused (it's the owner's input channel). Broadcast mentions are
// stripped and token-shaped strings redacted. Invalid files are skipped and fail the step.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createSlack, log, requireEnv } from "./slack.mjs";

const DIR = process.env.OUTBOX_DIR ?? ".loop/outbox";
const MAX_TEXT = 3000;
const MAX_MESSAGES = 20;
const TOKENISH =
  /(xox[abposr]-[\w-]+|xapp-[\w-]+|sk-ant-[\w-]+|gh[pousr]_\w{20,}|github_pat_\w+|phc_\w+|phx_\w+|-----BEGIN [A-Z ]*PRIVATE KEY-----)/g;

export function sanitize(text) {
  return text
    .replace(/<!(channel|here|everyone)(\|[^>]*)?>/gi, "")
    .replace(/<!subteam\^[^>]*>/gi, "")
    .replace(/@(channel|here|everyone)\b/gi, "$1")
    .replace(TOKENISH, "[redacted]");
}

export function validate(msg) {
  if (!msg || typeof msg !== "object") return "not an object";
  if (!["build", "decisions"].includes(msg.channel)) return "channel must be build or decisions";
  if (typeof msg.text !== "string" || !msg.text.trim()) return "text is empty";
  if (msg.text.length > MAX_TEXT) return `text over ${MAX_TEXT} chars`;
  if (msg.thread_ts !== undefined && !/^\d{10}\.\d{6}$/.test(String(msg.thread_ts)))
    return "thread_ts malformed";
  // A new #build-decisions thread must be a Tier B or Tier C post in the spec §5 format.
  if (
    msg.channel === "decisions" &&
    !msg.thread_ts &&
    !/^(DECISION NEEDED ·|HUMAN ONLY)/.test(msg.text)
  )
    return "new decision thread must start with 'DECISION NEEDED ·' or 'HUMAN ONLY'";
  return null;
}

export function loadOutbox(dir = DIR) {
  let names;
  try {
    names = readdirSync(dir)
      .filter((n) => n.endsWith(".json"))
      .sort();
  } catch (err) {
    if (err.code === "ENOENT") return { messages: [], rejected: [] };
    throw err;
  }
  return parseOutbox(names.map((name) => readFileSync(path.join(dir, name), "utf8")));
}

export function decodeOutbox(b64) {
  if (!b64) return [];
  const raws = JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
  if (!Array.isArray(raws) || !raws.every((r) => typeof r === "string"))
    throw new Error("OUTBOX_B64 is not an array of strings");
  return raws;
}

export function parseOutbox(raws) {
  const messages = [];
  const rejected = [];
  for (const [i, raw] of raws.entries()) {
    const n = i + 1; // logged instead of the agent-chosen file name
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      rejected.push({ n, reason: "invalid JSON" });
      continue;
    }
    const reason = validate(msg);
    if (reason) rejected.push({ n, reason });
    else if (messages.length >= MAX_MESSAGES) rejected.push({ n, reason: "over message cap" });
    else
      messages.push({
        n,
        channel: msg.channel,
        thread_ts: msg.thread_ts,
        text: sanitize(msg.text),
      });
  }
  return { messages, rejected };
}

export const PAUSE_NOTICE =
  "HUMAN ONLY · the loop paused itself (spec §7)\n" +
  "The agent reported an isolation-test failure, or asked to stop, and the runner created the " +
  "`loop/pause` branch. No run starts until the owner deletes it. The agent's own message, if it " +
  "wrote one, follows in #build-decisions.";

async function main() {
  const env = requireEnv("SLACK_BOT_TOKEN", "SLACK_BUILD_CHANNEL_ID", "SLACK_DECISIONS_CHANNEL_ID");
  const channels = { build: env.SLACK_BUILD_CHANNEL_ID, decisions: env.SLACK_DECISIONS_CHANNEL_ID };
  // Posted by the runner itself, so the pause is announced even if the agent wrote nothing.
  if (process.argv.includes("--pause-notice")) {
    await createSlack(env.SLACK_BOT_TOKEN).post(channels.decisions, PAUSE_NOTICE);
    return log("info", "outbox.pause_notice");
  }
  const { messages, rejected } =
    "OUTBOX_B64" in process.env ? parseOutbox(decodeOutbox(process.env.OUTBOX_B64)) : loadOutbox();
  for (const r of rejected) log("warn", "outbox.rejected", r);
  if (!messages.length && !rejected.length) return log("info", "outbox.empty");

  const slack = createSlack(env.SLACK_BOT_TOKEN);
  let failed = 0;
  for (const m of messages) {
    try {
      await slack.post(channels[m.channel], m.text, m.thread_ts);
      log("info", "outbox.posted", { n: m.n, channel: m.channel, thread: !!m.thread_ts });
    } catch (err) {
      failed++;
      log("error", "outbox.post_failed", { n: m.n, error: err.message });
    }
  }
  if (failed || rejected.length) process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    log("error", "outbox.failed", { error: err.message });
    process.exit(1);
  });
}
