# 0010 — agent permission model

**Status:** accepted — 2026-09-24

## Context

`specs/SPEC-autonomous-loop.md` §1: the agent should run routine work without approval prompts
and be unable to reach anything that is human-gated. `.claude/settings.json` previously denied
only two `.env` reads.

## Decision

Three layers, enforced by the harness rather than by the agent's own judgment:

1. **Allow list** (`permissions.allow`): the pnpm scripts (install, build, test, lint, typecheck,
   format), everyday git on branches, `gh pr create/view/comment/list/checks/diff`, `gh run
view/list`, and the local Supabase CLI (`start`, `stop`, `db start`, `db reset`, `test db`,
   `migration new`, `functions serve`). Reads and edits inside the repo are also allowed. Anything
   not listed falls back to the normal prompt.
2. **Deny list** (`permissions.deny`, which beats allow):
   - pushes to `main` and force-pushes;
   - every Supabase CLI command that reaches a hosted project (`link`, `db push/pull/dump`,
     `functions deploy`, `secrets`, `login`, `projects`, and any `--linked` / `--db-url` /
     `--project-ref`);
   - **all** `gh api` calls touching `protection` or `rulesets`, plus `gh ruleset`, `gh repo edit`,
     `gh secret` and `gh variable`. That includes reads, because a read and a write differ only
     in flags the pattern can't pin down reliably. Branch protection is changed by the owner only;
     the agent asks;
   - reading or writing `.env*` and key files;
   - reading or writing `design/`;
   - editing `.github/**`, `.claude/settings*.json` and `.claude/hooks/**`, so the loop can't
     modify its own guardrails.
3. **Guard hook** (`.claude/hooks/guard.mjs`, `PreToolUse` on Bash, PowerShell and the hosted
   Supabase MCP tools). File-tool rules don't cover the shell, so the hook blocks the same things
   in shell form:
   - `design/` paths;
   - writes to the protected config paths (`sed -i`, redirects, `tee`, `mv/cp/rm`, PowerShell
     `*-Item` / `*-Content`);
   - deletes whose target resolves outside the repo;
   - every hosted-Supabase MCP tool. The hook matches these by tool name because the connector's
     server id differs per machine.

The agent never runs in a skip-all-permissions mode on a machine with real credentials. If that
mode is ever used, it runs only inside an isolated container.

## Consequences

- A slice (edit → test → commit → push branch → PR) runs without prompts.
- Hosted-database work, protection changes and CI/permission edits always come back to the owner.
  Changes to this file and the hook come through a human-reviewed PR.
- The patterns are best effort, not a sandbox. A determined shell one-liner can still get past a
  glob. The backstops are branch protection on `main` (server-side) and the rule in spec §7 that
  the agent never edits this configuration.
- Checking hosted migration state, protection settings and similar now needs the owner, or a
  session where the owner approves the call.
