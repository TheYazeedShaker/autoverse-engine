# 0010 — agent permission model

**Status:** accepted — 2026-09-24. Amended 2026-09-25: merging and approval; approved design copies.

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
     `gh workflow`. Branch protection can be changed through REST
     or GraphQL, and a read and a write differ only in flags, so the whole command is denied. PRs
     are read with `gh pr view/diff/checks`. Branch protection belongs to the owner; the agent asks;
   - **merging and approving pull requests** (amended 2026-09-25): every `gh pr merge` and
     `gh pr review`, and the GitHub MCP tools `merge_pull_request`, `enable_pr_auto_merge` and
     `pull_request_review_write`. Agent PRs are commented on with `gh pr comment` / `add_issue_comment`;
     see _Merging and approval_ below;
   - reading or writing `.env` variants and key files (`.env.example` stays readable);
   - reading or writing `design/`, and editing or writing `design-approved/` (the owner's
     read-only copies for page specs; see _Approved design copies_);
   - editing `.github/**`, `.claude/settings*.json`, `.claude/hooks/**`, `.mcp.json` and
     `specs/SPEC-autonomous-loop.md` (spec §7: the loop never edits its own guardrails or spec).
3. **Guard hook** (`.claude/hooks/guard.mjs`, `PreToolUse` on Bash, PowerShell and the
   hosted-Supabase MCP tools, invoked via `$CLAUDE_PROJECT_DIR` so a `cd` can't lose it). File-tool
   rules don't cover the shell, so the hook checks each command segment, following `cd`:
   - `design/` and `design-approved/` paths, including `$PWD/…` forms and a `cd` into them, and a
     recursive content search whose root reaches either;
   - writes to the protected config (a redirect into it, or a write verb whose argument resolves
     there);
   - deletes (`rm`, `find -delete`, PowerShell `Remove-Item`…) whose target resolves outside the
     repo and outside the OS temp folder;
   - the hosted-Supabase MCP tools, matched by tool name because the connector's server id differs
     per machine. Names that other connectors share (`get_project`, `list_projects`) are only
     blocked when the input carries Supabase's `project_id` / `organization_id`;
   - `gh pr merge`, `gh pr review` and `gh api`, also behind `env` / `xargs` / `bash -c`, and the
     GitHub merge/approve MCP tools by name, under any server id. The permission rules alone match
     only a command's start, so they miss `env … gh pr merge`;
   - the GitHub file tools (`push_files`, `create_or_update_file`, `delete_file`) when they target
     `main`. They commit through the API, so the `git push … main` deny never sees them. A missing
     branch counts as `main`, because the API then writes to the default branch.
     It **fails closed**: if it errors or can't read its input, it blocks. Its cases are in
     `.claude/hooks/guard.test.mjs` (`node --test .claude/hooks/guard.test.mjs`).

The agent never runs in a skip-all-permissions mode on a machine with real credentials. If that
mode is ever used, it runs only inside an isolated container.

## Approved design copies (amended 2026-09-25, owner)

Page specs are built against the owner's design exports, and `design/` stays closed: no read,
write or shell access, exactly as before. When a page spec needs design files, the **owner copies
them** into `design-approved/<page>/`, a second gitignored folder. The agent may read the copies
with its file tools. It can't edit or write them (permission deny), and the shell can't touch them
at all (guard hook). The first set is the three showroom files for
`SPEC-page-consumer-showroom`, in `design-approved/showroom/`.

**Each new page spec adds its files the same way:** the owner copies the exact files the spec
names into `design-approved/<page>/`, as copies (never links into `design/`), and the spec points
at them there. No guard or settings change is needed per page. A spec's text grants nothing by
itself; only the owner's copy does. When a page ships, its folder can be deleted.

Why a copy and not an exception in `design/`: a permission deny always beats an allow, and a hook
can't override it. So an exception inside `design/` means removing the `Read(./design/**)` deny and
relying on the hook alone. A hook that fails to launch (no `node` on the PATH, hooks disabled, an SDK
session without project settings) would then leave all of `design/` readable. Worse, a review of that
design found Windows path forms (8.3 short names, NTFS stream syntax) that slip past a path check.
With a separate folder, the deny on `design/` never changes, and nothing depends on the hook for reads.

The same change narrows a gap found while building it: a recursive content search whose root sits
above `design/` read files there without naming them (`grep -r` ignores `.gitignore`). This part
is **best-effort**, a heuristic over command text like the rest of the guard. It refuses:

- `grep -r`/`-R`/`-d recurse`/`--directories=recurse`, `rgrep`, `rg` with `-u`/`--unrestricted`/
  `--no-ignore*`, and `git grep --no-index`/`--untracked`, when the search root is `design/`,
  `design-approved/` or a folder above either. Roots are resolved through symlinks; with no
  existing path named, the root is where the shell is. The command is recognised through a path or
  `.exe`, through `env`/`xargs`/`command`/`busybox`/`VAR=` prefixes, and inside `bash -c`, whose
  payload now gets every guard check.
- `git … --no-index` / `--untracked` no longer skip the path checks.
- anything setting `RIPGREP_CONFIG_PATH`, and changes to the files that decide what is ignored
  (the root `.gitignore`, and any `.rgignore` or `.ignore`). A `!design/` line in one of them would
  make plain `rg` read `design/`. **The root `.gitignore` is now owner-only.**

Plain `rg` honours `.gitignore` and stays allowed. Known to remain open, all heuristics' limits that
predate this change:

- tools that list names without reading contents: `find`, `ls -R`, `tree`, and Glob, which doesn't
  honour `.gitignore` by default. The file-tool deny covers Glob only when it's pointed at `design/`.
- commands that read without naming the folder in a form the guard parses: `find . -exec cat {} +`,
  `cp -r . /tmp/x`, PowerShell `Get-ChildItem -Recurse | Select-String`, `ack`/`ag -u`, shell globs
  and quoting (`cat de*gn/…`, `d''esign`), and interpreters (`node -e`, `python -c`).
- a link placed in `design-approved/` by hand. The agent can't create one there. A guard test fails
  if `design-approved/` holds any link, so the owner's copies stay copies.

## Merging and approval (amended 2026-09-25, owner, `#build-decisions`)

Claude sessions started from claude.ai act on GitHub **as the owner**: PR #40, opened by an agent
session, shows `TheYazeedShaker` as its author. Any merge right the owner holds, including the
ruleset bypass the owner uses for their own human-tier PRs, and any code-owner approval they could
give, would therefore also be available to such a session. The unattended runner is different: it
holds only the `autoverse-agent` App's installation token (ADR 0014).

So no agent session, whatever its GitHub identity, merges, approves or turns on auto-merge. Those
are the owner's actions in the GitHub UI. The owner's bypass is only for PRs the owner authored,
never for agent PRs. What a claude.ai session can and can't do against the server-side setup is
tested on a scratch PR first. The setup itself (rulesets and bypass list) follows as a runbook,
`docs/runbooks/owner-merge-bypass.md`, before code-owner review goes live.

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
- The agent can't turn on auto-merge for its own PRs. The auto-merge tier (spec §4) has to be
  switched on by something other than the agent session: a workflow step with the App token, on
  path rules the agent can't edit. That's part of the merge-tiers ADR.
