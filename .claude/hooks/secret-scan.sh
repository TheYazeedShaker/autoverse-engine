#!/usr/bin/env bash
# Blocks staging/committing obvious secrets. Wire into git pre-commit too.
set -euo pipefail
PATTERN='(SUPABASE_SERVICE_ROLE_KEY|SENTRY_AUTH_TOKEN|-----BEGIN [A-Z ]*PRIVATE KEY-----|sk_live_[0-9a-zA-Z]+|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,})'
if git diff --cached -U0 2>/dev/null | grep -nE "$PATTERN" >/dev/null 2>&1; then
  echo "BLOCKED: a possible secret is staged. Move it to env config; never commit keys." >&2
  exit 1
fi
exit 0
