# Runbook — the two `main` rulesets (as built)

Owner-only. This is the server-side half of the merge model in ADR 0010 (_Merging and approval_).
Agents never touch it: `gh api`, `gh ruleset` and every merge, approve and auto-merge path are
denied to them. The scratch-PR test on 2026-09-25 (PR #43, results in `#build`) proved that.

## What's active on `main` (owner, 2026-09-25)

| Ruleset       | Rules                                                                                                                        | Bypass   |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------- | -------- |
| `main-ci`     | Require status checks: `verify`, `isolation`, `phase-gate`, `secrets` (from `CI`) and `deno`. **Branch must be up to date.** | **None** |
| `main-review` | Require a pull request, **0** approvals, **review from Code Owners** on paths listed in `.github/CODEOWNERS`                 | **None** |

The classic branch-protection rule is deleted. The rulesets are the only protection.

Owner-verified results:

- A direct push to `main` is rejected.
- A docs PR (no code-owned path) can merge without review.
- Owner-authored PRs pass code-owner review without a bypass. See the caveat below: this needs
  re-checking once CODEOWNERS is clean.

Neither ruleset has a bypass, so the owner has no merge path the rules don't also see. That is
stricter than the first draft of this runbook, which gave the owner a pull-request-only bypass.

**Don't require** `Smoke (post-deploy)`, Vercel or Supabase checks. They don't run on every PR, and
a required check that never reports blocks the merge forever.

**Because of "up to date":** a PR must contain the tip of `main` before it can merge. An agent brings
its branch up to date with `git merge origin/main` (allowed, ADR 0010) and pushes. It never uses
the "Update branch" button, which is a GitHub write through the owner's identity.

## ⚠ Open items (2026-09-25)

1. **`.github/CODEOWNERS` on `main` contains this whole runbook** (#45 pasted all 116 lines; only
   lines 103–111 are ownership rules). GitHub skips the invalid lines, so the nine rules probably
   still apply. But the file view shows dozens of errors, and a stray single-word line counts as an
   ownerless rule. Last match wins, so such a line can quietly un-own paths. Replace the file with
   the nine rules alone. The clean file was sent to the owner in the session.
2. **"Owner-authored PRs pass code-owner review automatically" needs a real test.** When #45 merged,
   `main` had no CODEOWNERS, and GitHub reads CODEOWNERS from the base branch, so #45 wasn't subject
   to the rule. #44 touched only unowned paths. GitHub normally won't let a PR author satisfy their
   own code-owner review. If the owner is the only code owner, their human-tier PRs may be blocked,
   with no bypass to fall back on. **Test:** once CODEOWNERS is clean, open a one-line owner PR under
   `docs/adr/` and see whether the merge button is enabled.
   - _If it's blocked:_ add **Repository admin → For pull requests only** to `main-review`'s bypass
     list (never to `main-ci`).
   - _If it passes:_ keep reading.
3. **If owner-authored PRs do pass automatically, so do PRs from claude.ai sessions.** Those sessions
   act on GitHub as the owner (ADR 0010; #40 and #44 show the owner as author). Such a PR on a
   human-tier path would need no review, and the only human gate left is the merge click itself.
   Agent sessions can't make that click (the settings deny list and the guard). That holds today,
   because auto-merge is off. **The merge-tiers ADR must therefore auto-merge only PRs authored by
   the `autoverse-agent` App,** and only when they touch no code-owned path. A PR authored by the
   owner is never auto-merged, whoever opened it.

The unattended runner (ADR 0014) authors as the `autoverse-agent` App, so its human-tier PRs always
need the owner's code-owner review.

## Re-checking after any change

1. A PR with a required check still pending can't merge, and there is no bypass box.
2. An App-authored PR touching a code-owned path (for example `services/`) shows "Review required:
   code owner". The owner approves it in the GitHub UI, and it merges once green and up to date.
3. A docs-only PR needs only green CI.
4. A direct push to `main` is rejected.
5. Post the outcome in `#build`, and have the agent record it in `PROGRESS.md`.

## CODEOWNERS

The file lives at `.github/CODEOWNERS` (human-tier itself; the agent can't edit `.github/`). The
paths are the owner's, extending spec §4:

- `supabase/`: migrations and RLS, plus the gate and tests.
- `services/`: every current function touches leads or auth.
- `packages/types/`: the configurator protocol.
- `.github/`, `.claude/` and `CLAUDE.md`: the loop's guardrails.
- `specs/`: the loop spec among them.
- `docs/adr/`: decisions.
