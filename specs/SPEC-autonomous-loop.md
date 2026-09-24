# Build Spec — Autonomous Development Loop

**Task ID:** `AUTONOMOUS-LOOP`
**Staged in two parts:**
- **Part 1 — adopt NOW, during 1·A (supervised):** §1 permissions, §2 backlog, §5 escalation protocol (architect subagent + Slack tiers), §7 safety rails. These reduce interruptions without removing human oversight.
- **Part 2 — after the ENGINE-CORE-1A phase gate closes:** §3 unattended runner, §4 tiered auto-merge, §6 morning digest. The loop is proven supervised before it runs unattended.
**Goal:** agents work through an ordered backlog unattended: build → review → gate → merge (tiered) → next task. The human is interrupted only for decisions that truly need a human, and every morning starts with a digest.

---

## 1. Permissions (removes routine approval prompts)

In `.claude/settings.json`:
- **Allow** routine operations without prompting: pnpm scripts (install, build, test, lint, typecheck, format), git operations on non-main branches, `gh pr create/view/comment`, the local Supabase CLI (start, db reset, test), and reads/edits inside the repo, except the paths below.
- **Deny outright:** pushing to `main`; any command against the hosted/production Supabase; reading or writing `.env*` or key files; reading anything in `design/` (except when a spec explicitly lifts it); deleting outside the repo; changing `.github/`, `.claude/settings.json`, or branch-protection config (loop self-modification = human-gated).
- Never use a skip-all-permissions mode on a machine with real credentials. If one is ever used, it runs only inside an isolated container.

Record as an ADR.

## 2. Backlog

`BACKLOG.md` at the repo root: an ordered list of spec IDs, each with status (queued | in-progress | blocked | done) and dependencies. The agent always takes the first queued task whose dependencies are done. Only the human reorders or adds tasks; the agent only updates status.

## 3. Runner

Headless Claude Code runs on a schedule (e.g. every 2–3 hours plus on merge to `main`), from GitHub Actions (public repo = free minutes) or a small cloud VM. Implementer's choice, recorded in an ADR. Each run:
1. Checks the **kill switch**: if `PAUSE` exists at the repo root or the `agent_loop_enabled` flag is off, exit immediately.
2. Resumes from `PROGRESS.md` and `BACKLOG.md`.
3. Works until the task completes, the session limit is hit, or a max runtime (configurable, default 3h) is reached.
4. Leaves `PROGRESS.md` accurate before exiting, so the next run resumes cleanly.

The Anthropic API key and other secrets live in Actions secrets / VM env only, never in the repo. There's a monthly spend cap on the API key.

## 4. Tiered merge policy

Enforced with GitHub path rules plus auto-merge, not agent discretion:
- **Auto-merge** when the full CI wall is green and subagent reviews pass: `docs/`, tests, `packages/ui` components + stories, app UI code behind a feature flag defaulting to off.
- **Human approval required:** `supabase/migrations/`, RLS policies, `services/` edge functions touching leads, billing, or auth; `.github/`; `.claude/`; `packages/types` protocol changes; anything else under a CODEOWNERS entry for the human.

A PR touching both tiers counts as human-tier.

## 5. Escalation protocol (three tiers)

When the agent is uncertain, it classifies the question before stopping:

- **Tier A — answerable from governing docs.** The `architect` subagent (new, in `.claude/agents/`) answers it, reading CLAUDE.md, ADRs, specs, and PROGRESS.md. If the docs settle it, proceed and log the decision in the PR description. If it's significant, draft an ADR in the PR. The architect must cite the doc section it relied on; no citation → escalate to Tier B.
- **Tier B — judgment call within established patterns** (naming, a spec ambiguity, trade-offs between two valid approaches). Post to Slack `#build-decisions` in this exact format, then **skip to the next non-dependent task** (never idle):
  ```
  DECISION NEEDED · <task ID> · <one-line question>
  Context: <2–3 lines, file/spec references>
  Options: A) … B) …
  Agent's recommendation: <option> because <reason>
  Blocking: <what waits on this>
  ```
  A reply in the thread (from the human, or from Claude in chat acting on the human's request) unblocks it. Each run checks open threads for replies before picking new work.
- **Tier C — human-only:** credentials, money, legal/consent text, brand/client relationships, repo visibility, anything irreversible or outside the repo. Post to Slack with `HUMAN ONLY` in the first line. Never proceed on these from any reply except the human's.

## 6. Morning digest

The last run before 08:00 Cairo time (and any run after a phase gate) posts to `#build`: tasks completed; PRs auto-merged; PRs waiting for human review, with why they're human-tier; open Tier B/C decisions; failures or rollbacks; next task queued. Keep it scannable in 60 seconds.

## 7. Safety rails

- One task in progress at a time; stacked PRs allowed within a task.
- Three consecutive CI failures on the same task → mark it blocked, post Tier B, move on.
- Any isolation-test failure → stop the loop entirely, create `PAUSE`, post `HUMAN ONLY`.
- The agent never edits this spec, `BACKLOG.md` ordering, the permission config, or the merge policy.

## Acceptance criteria
- [ ] Allowlist/denylist in place; a full slice runs with zero permission prompts.
- [ ] `BACKLOG.md` exists and drives task selection.
- [ ] Scheduled runner works; kill switch verified (create `PAUSE` → next run exits).
- [ ] Tiered merge proven: one docs PR auto-merged, one migration PR held for the human.
- [ ] `architect` subagent resolves a doc-covered question with a citation; a Tier B question posted in format and answered via thread reply resumes correctly.
- [ ] One morning digest posted.
- [ ] Isolation-failure drill: the loop pauses itself.
- [ ] ADRs recorded: permission model, runner choice, merge tiers, escalation protocol.
