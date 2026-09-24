# 0009 — three-tier escalation protocol

**Status:** accepted — 2026-09-24

## Context

`specs/SPEC-autonomous-loop.md` §5 puts decisions into three tiers so the agent stops only for
questions a human actually has to answer. Before this, every uncertainty turned into a chat
question and the work stalled until someone replied.

## Decision

When the agent is uncertain, it classifies the question **before** it stops.

- **Tier A — the governing docs answer it.** The `architect` subagent (`.claude/agents/architect.md`)
  looks in the production plan (which wins any conflict), the active spec(s), the ADRs,
  `CLAUDE.md` with the other governing docs, and `PROGRESS.md`, in that order. If it can
  cite a section, the agent goes ahead and records the answer and the citation in the PR
  description. With no citation, the question goes to Tier B.
- **Tier B — a judgment call inside established patterns.** The agent posts to Slack
  `#build-decisions` in the spec's `DECISION NEEDED · …` format, then moves on to work that
  doesn't depend on the answer. Each cycle it checks open threads for replies before picking up
  new work.
- **Tier C — human only.** This covers credentials, money, legal or consent text, brand and client
  relationships, repo visibility, and anything irreversible or outside the repo. The agent posts
  with `HUMAN ONLY` in the first line and acts only on the owner's own reply.

Questions that touch tenant isolation, RLS, consent or lead data move up one tier when in doubt.

## Consequences

- Questions the docs already answer no longer interrupt a human.
- Every autonomous decision can be traced to a document section in a PR description.
- `#build-decisions` becomes the queue of open decisions. A thread without a reply blocks only the
  work that depends on it.
