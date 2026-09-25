# 0014 — the autonomous loop runs on GitHub Actions, authenticated with an API-key secret

**Status:** accepted — 2026-09-25 (owner)

## Context

`specs/SPEC-autonomous-loop.md` §3 asks for a headless Claude Code runner on a schedule (every 2–3
hours, plus on merge to `main`), on GitHub Actions or a small VM, "implementer's choice, recorded in
an ADR". Secrets must live only in Actions secrets or VM env, and the API key has a monthly spend
cap. §8 adds a separate Slack bot identity and a GitHub identity for the agent, separate from the
owner's.

## Decision

- **Runner: GitHub Actions.** It's a scheduled workflow plus `workflow_dispatch`, and nothing else
  (amended 2026-09-25, owner: no push trigger, so the loop's own merges never start a run). The spec's
  "on merge to `main`" is covered by the next scheduled run. The repo is public (ADR 0008), so the minutes are free. There's no VM to patch,
  and each run starts in a clean, throwaway container, which is where ADR 0010 allows unattended
  permission modes.
- **One run at a time:** a `concurrency` group with `cancel-in-progress: false`. Max runtime is set
  with `timeout-minutes` (default 180, spec §3).
- **Kill switch first:** before any agent step, the job exits if `PAUSE` exists at the repo root or
  the PostHog flag `agent_loop_enabled` is off. If the flag can't be read, that counts as off.
- **Model access: the `ANTHROPIC_API_KEY` Actions secret.** The key is a dedicated one with a
  monthly spend cap, set by the owner. Only the agent step gets it, as an env var. It's never put in
  a file, a log or an artifact.
- **Agent identities:**
  - GitHub: a GitHub App, through the Actions secrets `APP_ID` and `APP_PRIVATE_KEY`. Each run mints
    a short-lived installation token, so the agent's PRs aren't authored by the owner and the owner
    can approve them.
  - Slack: the `SLACK_BOT_TOKEN` secret, for the bot the owner added to `#build-inbox`. Only the
    `inbox` and `post` jobs get it, never the agent.
  - The owner's Slack user ID goes in an Actions **variable** (`OWNER_SLACK_USER_ID`), not in the
    repo. It's the only ID whose `#build-inbox` instructions and Tier C replies are honoured.
- **The agent's job holds nothing worth stealing** (amended 2026-09-25 after security review).
  The agent can run arbitrary code in its own job (it edits files and runs `pnpm` scripts), and any
  secret a job references can be read from the runner. So the workflow is five jobs, and only the
  `agent` job runs agent-influenced code. It holds `ANTHROPIC_API_KEY` and a read-only
  `GITHUB_TOKEN`, and nothing else:
  - `gate`: the PostHog key. It checks the kill switch.
  - `inbox`: the Slack token. It passes the owner's messages on through job outputs.
  - `agent`: works on local `agent/*` branches, and leaves a git bundle, PR requests, Slack messages
    and an optional pause request in a one-day artifact.
  - `publish`: a fresh runner on `main`, and the only job with the App key. It re-checks the kill
    switch, mints a token with `contents` and `pull-requests` only (no `workflows`), pushes
    `agent/*` branches fast-forward only, never deletes, and opens PRs. On a pause request it creates
    `loop/pause` itself.
  - `post`: a fresh runner on `main` with the Slack token. It posts the messages, marks the inbox
    read and sends the digest.

  `publish` and `post` read the artifact only as data. Checkout uses `persist-credentials: false`.
  Every external action is pinned to a full commit SHA, and Claude Code is pinned to an exact version
  whose `--max-budget-usd` caps each run at the `LOOP_MAX_BUDGET_USD` variable. The App should be
  installed on this repo only, with only the contents and pull-requests permissions. It must never
  be on a branch-protection bypass list. `main` changes only by merging PRs.

- **The agent runs under the repo's `.claude/settings.json`** (ADR 0010). The runner doesn't pass
  extra allow rules, and it doesn't skip permission checks.

## Alternatives considered

- **Small cloud VM:** a long-lived machine that has to be patched and paid for, with credentials at
  rest on its disk. Rejected.
- **OIDC federation instead of a long-lived API key:** the workflow would exchange its GitHub OIDC
  token for a short-lived Anthropic credential, so no API key would be stored at all. It's better,
  but it needs setup on the Anthropic side that isn't in place yet. The owner chose the key for now.
  Deferred; see Future hardening.

## Consequences

- Five things are set up by the owner, outside the repo: `ANTHROPIC_API_KEY`, `APP_ID`,
  `APP_PRIVATE_KEY`, `SLACK_BOT_TOKEN` and `POSTHOG_PERSONAL_API_KEY` (secrets), plus the
  `OWNER_SLACK_USER_ID` variable.
- The workflow and CODEOWNERS live under `.github/`, which ADR 0010 denies the agent. The agent writes
  the exact files, and the owner adds them in a human-reviewed PR.
- A leaked API key is limited by its spend cap until it's rotated. Rotation happens only in the
  Actions secret. Nothing in the repo changes.
- GitHub may delay or skip scheduled runs under load. The loop resumes from `PROGRESS.md` and
  `BACKLOG.md`, so a missed run only costs time.

## Future hardening

- **Replace `ANTHROPIC_API_KEY` with OIDC workload-identity federation** once it's set up for our
  Anthropic organisation: trust GitHub's OIDC issuer, limited to this repo and the runner workflow on
  `main`, with short-lived credentials per run. Then delete the stored key. Do the same for any other
  provider that supports federation.
