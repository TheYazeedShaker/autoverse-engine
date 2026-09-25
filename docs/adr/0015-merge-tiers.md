# 0015 — merge tiers: auto-merge only the agent App's PRs that touch no code-owned path

**Status:** proposed — 2026-09-25. **Auto-merge stays off until the owner accepts this ADR** and
completes _Turning it on_ below.

## Context

`specs/SPEC-autonomous-loop.md` §4 asks for a tiered merge policy "enforced with GitHub path rules
plus auto-merge, not agent discretion". Docs, tests, `packages/ui` and flagged app UI auto-merge on a
green wall; migrations, RLS, lead/billing/auth functions, `.github/`, `.claude/`, `packages/types`
and anything else code-owned by the human need the human. A PR touching both tiers is human-tier.

What's on `main` today (`docs/runbooks/owner-merge-bypass.md`):

- `main-ci` requires five checks and an up-to-date branch, with no bypass.
- `main-review` requires a PR and code-owner review on `.github/CODEOWNERS` paths, with no bypass.
- The owner verified on 2026-09-25 that **PRs the owner authors merge without review and without a
  bypass**. Claude sessions started from claude.ai act on GitHub as the owner (ADR 0010, _Merging
  and approval_), so their PRs pass code-owner review the same way, even on human-tier paths. For
  those PRs the only human gate left is the merge click itself.
- The unattended runner authors as the `autoverse-agent` GitHub App (ADR 0014), so its PRs on
  code-owned paths always wait for the owner's review.

So "who authored the PR" decides whether code-owner review means anything. Auto-merge must key on
it.

## Decision

1. **A PR is auto-merged only if all of these hold:**
   - its author is the `autoverse-agent` App's bot user, checked by numeric user ID (not by display
     name);
   - its head branch is in this repository (never a fork);
   - no changed file matches a `.github/CODEOWNERS` rule that has an owner, using the CODEOWNERS on
     the **base** branch, with GitHub's semantics (last matching rule wins);
   - it isn't a draft;
   - the loop isn't paused (no `PAUSE` on `main`, no `loop/pause` branch) and the auto-merge switch
     is on (below).

   Everything else in §4 (a green wall, an up-to-date branch, code-owner review where it applies) is
   enforced by the rulesets, not by this rule. Auto-merge only removes the click.

2. **Never auto-merged:** a PR authored by the owner, whoever opened it. That covers the owner's own
   PRs and every PR from a claude.ai session. Also never: PRs from any other user or App, and fork
   PRs.

3. **CODEOWNERS is the single definition of the human tier.** A path is human-tier if and only if
   CODEOWNERS gives it an owner. The spec's auto-merge list (docs, tests, `packages/ui`, flagged app
   UI) must therefore be a subset of the unowned paths, and every §4 human-tier path must be owned.
   A change to CODEOWNERS is itself human-tier (`/.github/` is owned).

4. **Re-checked on every push.** The rule is evaluated when a PR is opened, reopened, marked ready,
   and on every new commit. If a later commit adds an owned path, or anything else fails, auto-merge
   is turned off on that PR.

5. **Mechanism.** A workflow, `.github/workflows/agent-automerge.yml` (drafted separately, added by
   the owner):
   - runs on `pull_request_target`, so it always runs the base branch's copy of itself, which a PR
     can't modify;
   - **never checks out or runs PR code.** It reads the PR's author, head repo, draft state and file
     list, and the base's CODEOWNERS, through the API;
   - gets `pull-requests: write` and `contents: write` on its `GITHUB_TOKEN`, and nothing else;
   - enables auto-merge (squash) when the rule holds, and disables it when it doesn't;
   - logs its verdict and the owned paths it found, as structured JSON;
   - does nothing unless the Actions variable `AUTO_MERGE_ENABLED` is exactly `true`.

   The agent itself still never merges, approves or enables auto-merge (ADR 0010). In the runner it
   holds no GitHub write credential at all (ADR 0014): its branches and PR requests are published
   by a separate job that can push `agent/*` branches and open PRs, and nothing else.

6. **Defence in depth.** If the workflow is wrong, the rulesets still hold: an owned path can't merge
   without the owner's review, and nothing merges red or out of date. The worst a bug can do is merge
   an unowned-path agent PR that was already green.

## Turning it on (owner, in order)

1. Accept this ADR (merge it; `docs/adr/` is code-owned).
2. Close the CODEOWNERS gaps below, so the unowned set matches the spec's auto-merge tier.
3. Add `agent-automerge.yml` in a reviewed PR.
4. Repository settings → General → **Allow auto-merge**.
5. Set the Actions variable `AUTO_MERGE_ENABLED=true`.
6. Prove it (spec acceptance): one agent docs PR auto-merges; one agent migration PR is held for
   review. Post the evidence in `#build`.

**Kill path:** set `AUTO_MERGE_ENABLED` to anything else, and turn off **Allow auto-merge**, which
also stops PRs that are already queued. The drill in step 6 verifies both.

## CODEOWNERS gaps to close before step 5

Today these paths are unowned, so under this rule an agent PR touching only them would auto-merge.
None is in the spec's auto-merge tier:

| Path                                                                                                 | Why it's human-tier                                                                                                     |
| ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `/packages/engine-core/`                                                                             | Entitlement, tier and flag resolution: server-side access control (§4 "auth")                                           |
| `/packages/config/`, `/eslint.config.mjs`, `/tsconfig.base.json`, `/turbo.json`, `/.prettierrc.json` | The merge wall's own rules: a lint change can switch off "no empty catch" or "no hardcoded tokens"                      |
| `/package.json`, `/pnpm-lock.yaml`, `/pnpm-workspace.yaml`, `/.npmrc` (if added)                     | New dependencies and install scripts are supply-chain changes                                                           |
| `/.githooks/`, `/.gitattributes`                                                                     | Local secret-scan hooks                                                                                                 |
| `/BACKLOG.md`                                                                                        | Only the human orders or adds tasks (spec §2). See the open question: the agent's status updates would then need review |

Still unowned by design (the auto-merge tier): `docs/` outside `docs/adr/`, `PROGRESS.md`,
`packages/ui/`, `packages/design-tokens/` (its invariant test and the a11y gate cover it), `apps/`
(everything user-facing ships behind a server-side flag, default off), `README.md`, `.gitignore`.

## Alternatives considered

- **Auto-merge any PR that touches no owned path, whoever the author.** Rejected: owner-authored PRs
  already skip code-owner review, so this would let a claude.ai session's PR merge with no human
  involved at all.
- **Path allowlist in the workflow instead of CODEOWNERS.** Rejected: two definitions of the human
  tier would drift. The ruleset reads CODEOWNERS, so the workflow must too.
- **`pull_request` instead of `pull_request_target`.** Rejected: with `pull_request` the workflow file
  comes from the PR's head, so a PR could rewrite the rule that judges it. The App can't push
  workflow changes (its token has no `workflows` permission), but that shouldn't be the only guard.
- **Let the runner's publish job enable auto-merge with the App token.** Rejected: it would put
  the merge decision in the same job that handles the agent's output. ADR 0010 keeps every merge
  path away from anything the agent can influence.
- **A separate "merger" App.** Deferred; see Consequences.

## Consequences

- The owner reviews every agent PR on an owned path, and no owner-authored PR is ever merged without
  the owner's click.
- Adding the gaps above to CODEOWNERS means more agent PRs wait for review, including routine
  dependency bumps.
- A merge done through auto-merge enabled by `GITHUB_TOKEN` doesn't trigger `push` workflows, so
  CI's `push: main` run won't start for those merges. The merged tree is the one the required checks
  tested (the branch must be up to date), and Vercel deploys through its own GitHub App, so nothing
  is lost today. If a `push: main` workflow ever matters, use a dedicated merger App's token instead.
- CODEOWNERS becomes load-bearing for auto-merge, not only for review. A bad CODEOWNERS edit can widen
  the auto-merge tier, which is why the file is owned.

## Open questions for the owner

1. **`BACKLOG.md`:** own it (every status update then needs your review), or leave it unowned and
   add a CI check that fails when anything other than the Status column changes?
2. **`packages/design-tokens/` and `apps/`:** leave them in the auto-merge tier as proposed?
