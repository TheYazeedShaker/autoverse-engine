#!/usr/bin/env bash
# Blocks committing secrets. Runs in two places:
#   1. as a Claude Code PreToolUse hook on Bash (.claude/settings.json), and
#   2. as the git pre-commit hook (.githooks/pre-commit), so it also guards your own
#      `git commit` — including `git commit -am`, which stages right before this runs.
# CI runs gitleaks over the full history as the backstop (.github/workflows/ci.yml, `secrets`).
#
# Exit 2 = block. (Claude Code only blocks a tool call on exit 2; git blocks on any non-zero.)
set -uo pipefail

# Not in a git work tree (e.g. a Claude Bash call elsewhere): nothing to scan.
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0

block() {
  echo "BLOCKED by secret-scan: $1" >&2
  echo "Unstage it (git restore --staged <file>), move the value to env config, and try again." >&2
  exit 2
}

# Files that must never be committed, whatever they contain.
staged_files=$(git diff --cached --name-only --diff-filter=ACMR) || block "could not list staged files"
forbidden=$(printf '%s\n' "$staged_files" |
  grep -E '(^|/)(\.env(\.[^/]*)?|\.envrc|[^/]*\.(pem|key|p12|pfx)|id_(rsa|ed25519|ecdsa)(\.pub)?)$' |
  grep -vE '(^|/)\.env\.example$') || true
[ -n "$forbidden" ] && block "a secrets file is staged: $(echo "$forbidden" | tr '\n' ' ')"

# Secret-shaped content in added lines only.
PATTERN='(-----BEGIN [A-Z ]*PRIVATE KEY-----|sb_secret_[A-Za-z0-9_-]{20,}|eyJ[A-Za-z0-9_-]{20,}\.eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}|sk_(live|test)_[0-9a-zA-Z]{20,}|rk_live_[0-9a-zA-Z]{20,}|gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{40,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{10,}|phx_[A-Za-z0-9]{30,}|sntrys_[A-Za-z0-9+/=_-]{40,}|(SUPABASE_SERVICE_ROLE_KEY|SENTRY_AUTH_TOKEN|DATABASE_URL|SUPABASE_DB_PASSWORD)[[:space:]]*=[[:space:]]*[^[:space:]#]{8,})'
added=$(git diff --cached -U0 --diff-filter=ACMR -- . ':(exclude).env.example' ':(exclude)pnpm-lock.yaml') ||
  block "could not read the staged diff"
hit=$(printf '%s\n' "$added" | grep -E '^\+' | grep -nE "$PATTERN" | head -3) || true
[ -n "$hit" ] && block "a possible secret is staged:
$(echo "$hit" | cut -c1-120)"

exit 0
