// Run: node --test .claude/hooks/guard.test.mjs
// Each case feeds the hook the JSON Claude Code sends and checks the exit code (2 = blocked).
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";

const HOOK = path.join(import.meta.dirname, "guard.mjs");
const run = (input) =>
  spawnSync(process.execPath, [HOOK], {
    input: typeof input === "string" ? input : JSON.stringify(input),
  }).status;
const bash = (command) => run({ tool_name: "Bash", tool_input: { command } });

const BLOCKED = [
  "cat design/brief.md",
  "cd design && cat x",
  'cat "$PWD/design/x"',
  "sed -i s/a/b/ .claude/settings.json",
  "cd .claude && echo {} > settings.json",
  "echo x >> .github/workflows/ci.yml",
  "cp evil.sh .claude/hooks/secret-scan.sh",
  "rm -rf /c/Users/x",
  "cd .. && rm -rf other",
  "ls && rm -rf ../other",
  "find .. -delete",
  "rm -rf ~/x",
  "rm -rf $SOMEVAR/x",
  "Remove-Item -Recurse C:/Temp",
  "gh pr merge 12 --squash",
  "gh pr merge --auto --squash 12",
  "gh pr review 12 --approve",
  "gh pr review -a 12",
  "gh -R o/r pr merge 3",
  "cd apps && gh pr merge 3",
  "env GH_TOKEN=x gh pr merge 3",
  "echo 3 | xargs gh pr merge",
  'bash -c "gh pr merge 3"',
  "gh api -X PUT repos/o/r/pulls/3/merge",
  "gh api graphql -f query=x",
];

const ALLOWED = [
  "ls packages/design-tokens/src",
  "cat .github/workflows/ci.yml 2>/dev/null",
  "git add .claude/settings.json",
  'git commit -m "docs: design/ stays gitignored"',
  "git diff -- .github/ && pnpm install --frozen-lockfile",
  "rm -rf node_modules/.cache",
  "rm -f out.log > /dev/null",
  "rm -rf /tmp/x",
  'rm -rf "$TMPDIR/x"',
  `rm -rf ${path.join(os.tmpdir(), "scratch").replace(/\\/g, "/")}`,
  "cd /d/autoverase-engine && pnpm test",
  "gh pr view 12",
  "gh pr checks 12 && gh pr diff 12",
  "gh pr comment 12 --body ok",
  'gh pr create --title x --body "the agent never runs gh pr merge"',
  'git commit -m "block gh pr merge and gh api"',
];

for (const command of BLOCKED) {
  test(`blocks: ${command}`, () => assert.equal(bash(command), 2));
}
for (const command of ALLOWED) {
  test(`allows: ${command}`, () => assert.equal(bash(command), 0));
}

test("blocks hosted-Supabase MCP tools", () => {
  assert.equal(run({ tool_name: "mcp__abc__execute_sql", tool_input: {} }), 2);
  assert.equal(run({ tool_name: "mcp__abc__get_project", tool_input: { project_id: "x" } }), 2);
  assert.equal(run({ tool_name: "mcp__abc__pause_project", tool_input: { projectId: "x" } }), 2);
});

test("blocks the GitHub merge, approve and auto-merge tools under any server id", () => {
  for (const server of ["github", "claude_ai_GitHub"]) {
    for (const tool of [
      "merge_pull_request",
      "enable_pr_auto_merge",
      "pull_request_review_write",
    ]) {
      assert.equal(run({ tool_name: `mcp__${server}__${tool}`, tool_input: {} }), 2);
    }
  }
});

test("leaves the GitHub read and PR-authoring tools alone", () => {
  for (const tool of ["pull_request_read", "create_pull_request", "add_issue_comment"]) {
    assert.equal(run({ tool_name: `mcp__github__${tool}`, tool_input: {} }), 0);
  }
});

test("blocks the GitHub file tools from committing to main", () => {
  for (const server of ["github", "claude_ai_GitHub"]) {
    for (const tool of ["push_files", "create_or_update_file", "delete_file"]) {
      for (const branch of ["main", "refs/heads/main", " Main ", undefined, ""]) {
        assert.equal(run({ tool_name: `mcp__${server}__${tool}`, tool_input: { branch } }), 2);
      }
    }
  }
});

test("lets the GitHub file tools commit to a feature branch", () => {
  for (const tool of ["push_files", "create_or_update_file", "delete_file"]) {
    for (const branch of ["feat/x", "maintenance", "claude/main-fix"]) {
      assert.equal(run({ tool_name: `mcp__github__${tool}`, tool_input: { branch } }), 0);
    }
  }
});

test("leaves another connector's same-named read alone", () => {
  assert.equal(run({ tool_name: "mcp__vercel__get_project", tool_input: { projectId: "x" } }), 0);
});

test("fails closed on input it cannot parse", () => {
  assert.equal(run("not json"), 2);
});
