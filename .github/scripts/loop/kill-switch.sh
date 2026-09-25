#!/usr/bin/env bash
# Kill switch (ADR 0014). Writes run=true|false to $GITHUB_OUTPUT. Fails closed: anything it can't
# confirm counts as "stop". Run by the gate job before the agent starts, and again by the publish
# job before anything the agent made leaves the runner, so a pause or flag flip mid-run still
# stops publication.
# Env: POSTHOG_PERSONAL_API_KEY, POSTHOG_HOST, POSTHOG_PROJECT_ID, LOOP_MAX_BUDGET_USD.
set -uo pipefail

stop() {
  echo "::notice::Loop stopped: $1"
  echo "run=false" >> "$GITHUB_OUTPUT"
  exit 0
}

[ "${GITHUB_REF:-}" = "refs/heads/main" ] || stop "runs only from main (got ${GITHUB_REF:-unset})"
# PAUSE is read from main as it is now, not from this run's checkout (it may be hours old).
git fetch -q --no-tags "https://github.com/${GITHUB_REPOSITORY}.git" main 2> /dev/null \
  || stop "could not fetch main to check for PAUSE"
git cat-file -e FETCH_HEAD:PAUSE 2> /dev/null && stop "PAUSE exists on main"

git ls-remote --exit-code --heads "https://github.com/${GITHUB_REPOSITORY}.git" loop/pause > /dev/null 2>&1
case $? in
  0) stop "branch loop/pause exists (the loop paused itself; the owner deletes it to resume)" ;;
  2) ;;
  *) stop "could not check for loop/pause" ;;
esac

if ! [[ "${LOOP_MAX_BUDGET_USD:-}" =~ ^[0-9]+(\.[0-9]+)?$ ]] \
   || ! awk -v b="$LOOP_MAX_BUDGET_USD" 'BEGIN { exit !(b > 0) }'; then
  stop "LOOP_MAX_BUDGET_USD is unset or not a positive number"
fi

if [ -z "${POSTHOG_PERSONAL_API_KEY:-}" ] || [ -z "${POSTHOG_HOST:-}" ] || [ -z "${POSTHOG_PROJECT_ID:-}" ]; then
  stop "PostHog flag settings are incomplete"
fi
flag=$(curl -sS --fail --max-time 10 --retry 2 \
         -H "Authorization: Bearer $POSTHOG_PERSONAL_API_KEY" \
         "${POSTHOG_HOST%/}/api/projects/${POSTHOG_PROJECT_ID}/feature_flags/?search=agent_loop_enabled" \
       | jq -r '[.results[] | select(.key == "agent_loop_enabled" and (.deleted | not))][0].active // false') \
  || flag=unreadable
[ "$flag" = "true" ] || stop "agent_loop_enabled is $flag"

echo "run=true" >> "$GITHUB_OUTPUT"
