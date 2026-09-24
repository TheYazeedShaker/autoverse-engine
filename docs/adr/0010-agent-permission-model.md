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
   - pushes to `main` (by name, `:main` or `refs/heads/main`) and every form of force-push;
   - every Supabase CLI command that reaches a hosted project: `link`, `login`, `projects`, `orgs`,
     `db push/pull/dump`, `migration list/repair/fetch`, `functions deploy/delete/download`,
     `secrets`, `config push`, `branches`, `backups`, `inspect`, `storage`, `postgres-config`,
     `sso`, `domains`, `vanity-subdomains`, `network-*`, `ssl-*`, and any `--linked` /
     `--db-url` / `--project-ref` / `--project-id`; plus `psql` to a Supabase host;
   - **all of `gh api`**, plus `gh ruleset`, `gh repo edit/delete`, `gh secret`, `gh variable`,
     `gh workflow` and `gh pr merge --admin`. Branch protection can be changed through REST
     or GraphQL, and a read and a write differ only in flags, so the whole command is denied. PRs
     are read with `gh pr view/diff/checks`. Branch protection belongs to the owner; the agent asks;
   - reading or writing `.env` variants and key files (`.env.example` stays readable);
   - reading or writing `design/`;
   - editing `.github/**`, `.claude/settings*.json`, `.claude/hooks/**`, `.mcp.json` and
     `specs/SPEC-autonomous-loop.md` (spec §7: the loop never edits its own guardrails or spec).
3. **Guard hook** (`.claude/hooks/guard.mjs`, `PreToolUse` on Bash, PowerShell and the
   hosted-Supabase MCP tools, invoked via `$CLAUDE_PROJECT_DIR` so a `cd` can't lose it). File-tool
   rules don't cover the shell, so the hook checks each command segment, following `cd`:
   - `design/` paths, including `$PWD/…` forms and a `cd` into it;
   - writes to the protected config (a redirect into it, or a write verb whose argument resolves
     there);
   - deletes (`rm`, `find -delete`, PowerShell `Remove-Item`…) whose target resolves outside the
     repo and outside the OS temp folder;
   - the hosted-Supabase MCP tools, matched by tool name because the connector's server id differs
     per machine. Names that other connectors share (`get_project`, `list_projects`) are only
     blocked when the input carries Supabase's `project_id` / `organization_id`.
     It **fails closed**: if it errors or can't read its input, it blocks. Its cases are in
     `.claude/hooks/guard.test.mjs` (`node --test .claude/hooks/guard.test.mjs`).

The agent never runs in a skip-all-permissions mode on a machine with real credentials. If that
mode is ever used, it runs only inside an isolated container.

## Consequences

- A slice (edit → test → commit → push branch → PR) runs without prompts.
- Hosted-database work, protection changes and CI/permission edits always come back to the owner.
  Changes to this file and the hook come through a human-reviewed PR.
- The patterns and the hook are a heuristic over command text, not a sandbox. A determined
  one-liner can still get past them (an interpreter running a script, a variable built at run
  time). The backstops are branch protection on `main` (server-side) and the rule in spec §7 that
  the agent never edits this configuration.
- Checking hosted migration state, protection settings and similar now needs the owner, or a
  session where the owner approves the call.
