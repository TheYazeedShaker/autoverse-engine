// Run: node --test .claude/hooks/guard.test.mjs
// Each case feeds the hook the JSON Claude Code sends and checks the exit code (2 = blocked).
import { spawnSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";

const REPO = path.resolve(import.meta.dirname, "..", "..");
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

// ---- design-approved/ and recursive searches (ADR 0010, "Approved design copies") ------------

test("the shell can't read or write the approved design copies", () => {
  for (const command of [
    'cat "design-approved/showroom/VehicleCard.dc.html"',
    "grep -n Configure design-approved/showroom/TechDrawer.dc.html",
    "head -50 design-approved/showroom/TechDrawer.dc.html | less",
    "cd design-approved && cat showroom/x.html",
    "cp x.html design-approved/showroom/VehicleCard.dc.html",
    "echo x > design-approved/showroom/VehicleCard.dc.html",
    "sed -i s/a/b/ design-approved/showroom/VehicleCard.dc.html",
  ]) {
    assert.equal(bash(command), 2, command);
  }
});

test("a recursive search whose root reaches design/ is refused", () => {
  for (const command of [
    "grep -rn Configure",
    "grep -rn Configure .",
    "grep -R -A 3 Configure",
    "grep --recursive Configure design-approved",
    "cd packages && grep -rn x ..",
    "rgrep Configure",
    "rg -uu Configure",
    "rg --no-ignore x .",
    // Spellings from the security review.
    "rg --unrestricted x",
    "rg --no-ignore-vcs x",
    "grep -d recurse x .",
    "grep --directories=recurse x",
    "/usr/bin/grep -r x .",
    "grep.exe -r x .",
    "env grep -r x .",
    "LC_ALL=C grep -r x",
    "echo . | xargs grep -r x",
    "command grep -r x",
    "busybox grep -r x .",
    'bash -c "grep -r x ."',
    'bash -c "cat design/brief.md"',
    "git grep --no-index x",
    "git grep --untracked x",
    "git diff --no-index /dev/null design/brief.md",
    "RIPGREP_CONFIG_PATH=cfg rg x",
    // Abbreviated long options and combined shell flags (second review).
    "grep --recursiv x .",
    "grep --direc=recurse x",
    "git grep --no-inde x",
    "git grep --untr x",
    'bash -lc "grep -r x ."',
    'env bash -c "grep -r x ."',
  ]) {
    assert.equal(bash(command), 2, command);
  }
});

test("a search root that is a symlink is judged by where it points", (t) => {
  const dir = mkdtempSync(path.join(REPO, "packages", "guard-"));
  try {
    try {
      symlinkSync(REPO, path.join(dir, "up"), "junction");
    } catch {
      return t.skip("this machine can't create links");
    }
    const root = path.relative(REPO, path.join(dir, "up")).replace(/\\/g, "/");
    assert.equal(bash(`grep -r x ${root}`), 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the files that decide what rg and git ignore are human-gated", () => {
  for (const command of [
    "echo '!design/' > .rgignore",
    "echo '!design/' >> packages/.ignore",
    "echo '!design/' >> .gitignore",
    "sed -i s/design// .gitignore",
  ]) {
    assert.equal(bash(command), 2, command);
  }
});

test("design-approved/ holds copies, never links back into design/", () => {
  const approved = path.join(REPO, "design-approved");
  if (!existsSync(approved)) return;
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      assert.ok(!lstatSync(p).isSymbolicLink(), `${path.relative(REPO, p)} is a link`);
      if (e.isDirectory()) walk(p);
    }
  };
  walk(approved);
});

test("recursive searches elsewhere, and ordinary rg, still work", () => {
  for (const command of [
    "grep -rn Configure packages services",
    "grep -n x PROGRESS.md",
    "rg Configure",
    "rg -n x packages",
  ]) {
    assert.equal(bash(command), 0, command);
  }
});

test("settings keep design/ unreadable and the approved copies read-only", () => {
  const settings = JSON.parse(
    readFileSync(path.join(import.meta.dirname, "..", "settings.json"), "utf8"),
  );
  const { allow, deny } = settings.permissions;
  for (const rule of ["Read(./design/**)", "Edit(./design/**)", "Write(./design/**)"]) {
    assert.ok(deny.includes(rule), rule);
  }
  for (const rule of ["Edit(./design-approved/**)", "Write(./design-approved/**)"]) {
    assert.ok(deny.includes(rule), rule);
  }
  // Readable through Read(./**); nothing may deny reading the copies.
  assert.ok(allow.includes("Read(./**)"));
  assert.ok(!deny.some((r) => r.startsWith("Read(./design-approved")));
});

test("fails closed on input it cannot parse", () => {
  assert.equal(run("not json"), 2);
});
