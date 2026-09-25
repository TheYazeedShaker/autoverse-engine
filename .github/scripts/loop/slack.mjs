// Slack Web API client for the loop runner (ADR 0014). Runs in workflow steps only: the agent step
// never gets SLACK_BOT_TOKEN. Every call has a timeout. Reads retry; writes retry only on 429,
// because Slack rejects a rate-limited request before doing anything with it.
const API = "https://slack.com/api/";
const TIMEOUT_MS = 10_000;
const MAX_ATTEMPTS = 3;

// Structured JSON logs, one trace ID per run. Never log message text: it can carry anything.
export function log(level, event, fields = {}) {
  const line = { level, event, trace_id: process.env.GITHUB_RUN_ID ?? "local", ...fields };
  process.stdout.write(JSON.stringify(line) + "\n");
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function createSlack(token, { fetchImpl = fetch, sleepImpl = sleep } = {}) {
  if (!token) throw new Error("SLACK_BOT_TOKEN is not set");

  async function call(method, params, { write = false } = {}) {
    for (let attempt = 1; ; attempt++) {
      let res;
      try {
        // Reads go form-encoded: some Slack read methods (conversations.replies among them) reject
        // JSON bodies with `invalid_arguments`. Writes keep JSON, which they accept.
        const form = new URLSearchParams();
        for (const [k, v] of Object.entries(params)) if (v !== undefined) form.append(k, String(v));
        res = await fetchImpl(API + method, {
          method: "POST",
          headers: {
            authorization: `Bearer ${token}`,
            "content-type": write
              ? "application/json; charset=utf-8"
              : "application/x-www-form-urlencoded",
          },
          body: write ? JSON.stringify(params) : form.toString(),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
      } catch (err) {
        // A write that timed out may have landed; never repeat it.
        if (write || attempt >= MAX_ATTEMPTS) throw new Error(`${method}: ${err.name}`);
        log("warn", "slack.retry", { method, attempt, reason: err.name });
        await sleepImpl(1000 * 2 ** attempt);
        continue;
      }
      if (res.status === 429 && attempt < MAX_ATTEMPTS) {
        const wait = Number(res.headers.get("retry-after") ?? "5");
        log("warn", "slack.rate_limited", { method, attempt, wait });
        await sleepImpl(wait * 1000);
        continue;
      }
      if (res.status >= 500 && !write && attempt < MAX_ATTEMPTS) {
        log("warn", "slack.retry", { method, attempt, status: res.status });
        await sleepImpl(1000 * 2 ** attempt);
        continue;
      }
      const body = await res.json().catch(() => ({ ok: false, error: `http_${res.status}` }));
      if (!body.ok) throw new Error(`${method}: ${body.error}`);
      return body;
    }
  }

  return {
    call,
    async whoami() {
      const r = await call("auth.test", {});
      return { userId: r.user_id, botId: r.bot_id };
    },
    async history(channel, oldest) {
      const out = [];
      let cursor;
      do {
        const r = await call("conversations.history", { channel, oldest, limit: 200, cursor });
        out.push(...r.messages);
        cursor = r.response_metadata?.next_cursor || undefined;
      } while (cursor);
      return out;
    },
    async replies(channel, ts) {
      const out = [];
      let cursor;
      do {
        const r = await call("conversations.replies", { channel, ts, limit: 200, cursor });
        out.push(...r.messages);
        cursor = r.response_metadata?.next_cursor || undefined;
      } while (cursor);
      return out.filter((m) => m.ts !== ts); // drop the parent
    },
    post(channel, text, threadTs) {
      return call(
        "chat.postMessage",
        { channel, text, thread_ts: threadTs, unfurl_links: false, unfurl_media: false },
        { write: true },
      );
    },
    async react(channel, ts, name) {
      try {
        await call("reactions.add", { channel, timestamp: ts, name }, { write: true });
      } catch (err) {
        if (!String(err.message).endsWith("already_reacted")) throw err;
      }
    },
  };
}

export function requireEnv(...names) {
  const missing = names.filter((n) => !process.env[n]);
  if (missing.length) throw new Error(`missing env: ${missing.join(", ")}`);
  return Object.fromEntries(names.map((n) => [n, process.env[n]]));
}
