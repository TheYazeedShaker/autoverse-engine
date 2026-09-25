# Runbook — the two `main` rulesets and the owner's merge bypass

Owner-only. It sets up the server-side half of the merge model in ADR 0010 (_Merging and approval_).
Agents never touch it: `gh api`, `gh ruleset` and every merge, approve and auto-merge path are
denied to them, and the scratch-PR test on 2026-09-25 (PR #43, results in `#build`) proved it.

**The problem this solves.** Code-owner review on `main` would deadlock the owner's own PRs. A PR's
author can't approve it, and the owner is the only code owner. The fix is two rulesets:

1. **CI checks**, with **no bypass for anyone.** Nothing reaches `main` red, the owner's PRs included.
2. **Code-owner review**, with **the owner's admin bypass, for pull requests only.** The owner can
   merge their own human-tier PR past the review rule, but only through a PR, so ruleset 1 still
   applies. No app is on either bypass list.

A path with no code owner needs no review, so docs, tests and UI PRs stay in the auto-merge tier
(spec §4). That tier is switched on later by the merge-tiers ADR, not by this runbook.

## 0. Before you start

- **CODEOWNERS must be on `main` first.** Without it, "Require review from Code Owners" matches no
  file and does nothing. The agent can't write under `.github/`, so you add it, as a normal PR that
  you merge. Suggested content is at the end of this runbook.
- Leave **Settings → General → Pull Requests → Allow auto-merge** as it is (off). It stays held
  until the merge-tiers ADR (PROGRESS "Human-only setup").
- The required checks must have run in the last 7 days to show up in the picker. Any recent PR
  covers that.

## 1. Ruleset A — `main: CI checks` (no bypass)

**Settings → Rules → Rulesets → New ruleset → New branch ruleset.**

| Field                 | Value                                                                                                                                        |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Ruleset name          | `main: CI checks`                                                                                                                            |
| Enforcement status    | **Active**                                                                                                                                   |
| Bypass list           | **Leave empty.** Don't add Repository admin, and don't add any app                                                                           |
| Target branches       | **Add target → Include default branch**                                                                                                      |
| Restrict deletions    | ✅ on                                                                                                                                        |
| Block force pushes    | ✅ on                                                                                                                                        |
| Require status checks | ✅ on, then **Add checks**, source **GitHub Actions**: `verify`, `isolation`, `phase-gate`, `secrets` (all from `CI`), and `deno`            |
| ↳ up to date          | Off. It forces a base merge after every merge to `main`, and CI already runs again on `main` after each merge (`push: { branches: [main] }`) |
| ↳ skip on creation    | Off                                                                                                                                          |
| Every other rule      | Off. Pull-request and review rules go in ruleset B                                                                                           |

**Create.**

Don't require `Smoke (post-deploy)`: it runs on `deployment_status`, not on PRs, so a PR would never
get it and would wait forever. Leave the Vercel and Supabase integration checks out too. Neither is
a gate in production plan §10, and a required check that doesn't report blocks the merge.

## 2. Ruleset B — `main: code-owner review` (owner bypass, pull requests only)

**New ruleset → New branch ruleset** again.

| Field                                  | Value                                                                                                                                                                                       |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ruleset name                           | `main: code-owner review`                                                                                                                                                                   |
| Enforcement status                     | **Active**                                                                                                                                                                                  |
| Bypass list                            | **Add bypass → Repository admin**. Then open its menu and choose **For pull requests only** (not _Always allow_). Add nothing else: no Claude app, no `autoverse-agent` app, no deploy keys |
| Target branches                        | **Include default branch**                                                                                                                                                                  |
| Require a pull request before merging  | ✅ on                                                                                                                                                                                       |
| ↳ Required approvals                   | **0**. The code-owner rule below is the only review requirement                                                                                                                             |
| ↳ Dismiss stale approvals on new push  | ✅ on                                                                                                                                                                                       |
| ↳ Require review from Code Owners      | ✅ on                                                                                                                                                                                       |
| ↳ Require approval of most recent push | Off. You're the only code owner, so a fix-up you push to an agent PR could never be approved by anyone else. Stale-approval dismissal already covers agent pushes                           |
| ↳ Require conversation resolution      | ✅ on                                                                                                                                                                                       |
| ↳ Allowed merge methods                | Leave all three on (the repo merges with merge commits today)                                                                                                                               |
| Every other rule                       | Off                                                                                                                                                                                         |

**Create.**

_For pull requests only_ means the bypass can't be used to push to `main` directly. It only appears
as the "Merge without waiting for requirements to be met (bypass rules)" box on a PR's merge button.
Ruleset A has no bypass, so even then the PR has to be green.

## 3. Check it (a few minutes)

1. **Ruleset A:** on any PR with a required check still pending, the merge button is blocked, and
   there is no bypass box for the CI checks.
2. **Ruleset B, agent PR:** an agent PR that touches a code-owned path (for example `services/`)
   shows "Review required: code owner". Approve it from the GitHub UI and it can merge once green.
3. **Ruleset B, your own PR:** a PR you authored that touches a code-owned path shows the bypass box
   once CI is green. That is the deadlock resolved.
4. **Agent docs PR:** a docs-only agent PR needs no review, only green CI.
5. Post the outcome in `#build`, and have the agent record it in `PROGRESS.md`.

## The remaining risk, stated plainly

A claude.ai session acts on GitHub **as you** (ADR 0010). To GitHub, such a session has your admin
bypass on ruleset B. Only the agent-side layers stop it from using that bypass: the settings deny
list and the guard hook, which the scratch-PR test proved. Ruleset A still holds either way, so the
worst case is "merged green without review", never "merged red". The unattended runner (ADR 0014)
uses the `autoverse-agent` App token, which is on neither bypass list, so it can't bypass anything.

## Suggested `.github/CODEOWNERS`

Paths from spec §4 (human-tier). The last two lines are additions: the operating manual and the
loop's own spec are guardrails, and spec §7 already forbids the agent from editing them.

```
# Human-tier paths (specs/SPEC-autonomous-loop.md §4). Any PR touching one needs the owner.
# A PR that touches both tiers is human-tier.
/supabase/migrations/            @TheYazeedShaker
/services/                       @TheYazeedShaker
/packages/types/                 @TheYazeedShaker
/.github/                        @TheYazeedShaker
/.claude/                        @TheYazeedShaker
/CLAUDE.md                       @TheYazeedShaker
/specs/SPEC-autonomous-loop.md   @TheYazeedShaker
```

All of `services/` is listed because every current function touches leads or auth: `capture-lead`,
`ingest-event` (caller authorization), `validate-theme` (brand write auth), `job-worker` (lead
notifications) and `shared`. RLS lives in migrations, so `/supabase/migrations/` covers it.
