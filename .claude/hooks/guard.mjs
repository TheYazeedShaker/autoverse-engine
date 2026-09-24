#!/usr/bin/env node
// Backstop for the permission rules in .claude/settings.json (ADR 0010).
//
// Read/Edit deny rules only cover Claude's file tools. A shell command can still `cat design/…`,
// `sed -i` the settings file, or `rm -rf` outside the repo. This PreToolUse hook sees every
// Bash/PowerShell command and the hosted-Supabase MCP tools, and blocks those shapes too.
//
// It is a heuristic over command text, not a sandbox. The server-side backstop is branch
// protection on main. It fails CLOSED: any error in here blocks the call.
//
// Exit 2 = block (Claude Code shows stderr to the agent). Exit 0 = allow.
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const REPO = path.resolve(import.meta.dirname, "..", "..");
const TEMP_ROOTS = [path.resolve(os.tmpdir())];

function block(reason) {
  process.stderr.write(`BLOCKED by guard: ${reason}\nThis needs the human — see ADR 0010.\n`);
  process.exit(2);
}

// Supabase MCP tools share a few names with other connectors (e.g. Vercel's list_projects). Those
// generic names are only treated as Supabase when the input carries Supabase's snake_case ids.
const SUPABASE_ONLY =
  /__(apply_migration|execute_sql|deploy_edge_function|list_migrations|list_tables|list_extensions|list_edge_functions|get_edge_function|get_advisors|query_logs|get_logs|generate_typescript_types|get_publishable_keys|get_project_url|create_branch|delete_branch|merge_branch|reset_branch|rebase_branch|list_branches|restore_project|confirm_cost|get_cost|list_organizations|get_organization)$/;
const SHARED = /__(pause_project|create_project|get_project|list_projects)$/;

function checkMcp(toolName, toolInput) {
  if (SUPABASE_ONLY.test(toolName)) block(`${toolName} reaches the hosted Supabase project`);
  if (SHARED.test(toolName)) {
    const keys = Object.keys(toolInput ?? {});
    if (
      /pause_project|create_project/.test(toolName) ||
      keys.some((k) => /^(project_id|organization_id)$/.test(k))
    ) {
      block(`${toolName} reaches a hosted project`);
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Shell commands
// ---------------------------------------------------------------------------------------------

/** Git Bash spells D:\x as /d/x. */
const toNative = (p) => p.replace(/^\/([a-z])(\/|$)/i, "$1:/");
const inside = (root, p) => {
  const rel = path.relative(root, p);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
};
const PROTECTED_DIRS = [".claude", ".github", "design"].map((d) => path.join(REPO, d));
const isProtectedDir = (p) => PROTECTED_DIRS.some((d) => inside(d, p));

/** Split on ; && || | and newlines, ignoring separators inside quotes. */
function segments(command) {
  const out = [];
  let current = "";
  let quote = null;
  for (let i = 0; i < command.length; i += 1) {
    const c = command[i];
    if (quote) {
      if (c === quote) quote = null;
      current += c;
    } else if (c === "'" || c === '"') {
      quote = c;
      current += c;
    } else if (c === ";" || c === "\n" || c === "|" || (c === "&" && command[i + 1] === "&")) {
      if (c === "&" || (c === "|" && command[i + 1] === "|")) i += 1;
      out.push(current.trim());
      current = "";
    } else {
      current += c;
    }
  }
  out.push(current.trim());
  return out.filter(Boolean);
}

/** Whitespace tokens with surrounding quotes removed. Good enough for paths; not a full parser. */
const tokens = (segment) =>
  (segment.match(/"[^"]*"|'[^']*'|\S+/g) ?? []).map((t) => t.replace(/^(['"])(.*)\1$/, "$2"));

function resolveArg(arg, cwd) {
  // Git Bash maps /tmp to the OS temp folder.
  if (/^(\/tmp|\$TMPDIR|\$\{TMPDIR\}|\$TEMP|\$TMP|\$env:TEMP|\$env:TMP)(\/|\\|$)/i.test(arg)) {
    return path.join(os.tmpdir(), arg.replace(/^[^/\\]+/, ""));
  }
  const expanded = arg.replace(/^(\$PWD|\$\{PWD\}|\$\(pwd\))/, cwd);
  if (/^(~|\$)/.test(expanded)) return null; // an unknown variable or home: can't tell where it points
  return path.resolve(cwd, toNative(expanded));
}

const WRITE_VERB =
  /(^|\s)(sed\s+(-\S*\s+)*-i|perl\s+-\S*i|tee|mv|cp|rm|truncate|install|ln|chmod|Set-Content|Add-Content|Clear-Content|Out-File|Remove-Item|Move-Item|Copy-Item|New-Item|Rename-Item)(\s|$)/i;
const DELETE_CMD = /^(rm|rmdir|unlink|Remove-Item|ri|del|rd|erase)$/i;
const REDIRECT = /^\d*>>?$|^&>$/;

function checkShell(command) {
  let cwd = REPO;

  for (const segment of segments(command)) {
    const words = tokens(segment);
    const [cmd = "", ...args] = words;

    // Commit messages and PR text mention paths without touching them, and design/ is gitignored.
    if (/^(git|gh)$/.test(cmd)) continue;

    if (/^(cd|pushd|Set-Location|sl|chdir)$/i.test(cmd)) {
      const target = args.find((a) => !a.startsWith("-"));
      const next = target ? resolveArg(target, cwd) : os.homedir();
      if (!next) block(`cd into an unresolvable location: ${target}`);
      if (isProtectedDir(next))
        block(`cd into ${path.relative(REPO, next)} — work on it from the repo root`);
      cwd = next;
      continue;
    }

    // Everything the segment names as a path, resolved against where the shell is now.
    const redirectTargets = [];
    const plainArgs = [];
    for (let i = 0; i < args.length; i += 1) {
      if (REDIRECT.test(args[i])) {
        if (args[i + 1]) redirectTargets.push(args[i + 1]);
        i += 1;
      } else if (/^\d*>>?\S/.test(args[i])) {
        redirectTargets.push(args[i].replace(/^\d*>>?/, ""));
      } else {
        plainArgs.push(args[i]);
      }
    }
    const resolved = (list) =>
      list
        .filter((a) => !a.startsWith("-") && a !== "/dev/null")
        .map((a) => [a, resolveArg(a, cwd)]);

    // 1. design/ is the owner's. Never read, modified or committed.
    for (const [raw, p] of resolved([...plainArgs, ...redirectTargets])) {
      if (p && inside(path.join(REPO, "design"), p)) block(`design/ is off limits (${raw})`);
    }

    // 2. The loop never modifies its own guardrails: permissions, hooks, CI.
    const guarded = (p) =>
      p &&
      (inside(path.join(REPO, ".github"), p) ||
        inside(path.join(REPO, ".claude", "hooks"), p) ||
        /^settings(\.local)?\.json$/.test(path.relative(path.join(REPO, ".claude"), p)));
    for (const [raw, p] of resolved(redirectTargets)) {
      if (guarded(p)) block(`writing ${raw} is human-gated`);
    }
    if (WRITE_VERB.test(segment)) {
      for (const [raw, p] of resolved(plainArgs)) {
        if (guarded(p)) block(`changing ${raw} is human-gated`);
      }
    }

    // 3. No deleting outside the repository (the OS temp folder, incl. the scratchpad, is fine).
    const deleting =
      DELETE_CMD.test(cmd) || (cmd === "find" && /\s-(delete|exec\s+rm)\b/.test(segment));
    if (deleting) {
      const targets =
        cmd === "find" ? plainArgs.filter((a) => !a.startsWith("-")).slice(0, 1) : plainArgs;
      for (const [raw, p] of resolved(targets)) {
        if (!p) block(`delete of an unresolvable path: ${raw}`);
        if (!inside(REPO, p) && !TEMP_ROOTS.some((t) => inside(t, p)))
          block(`delete outside the repo: ${raw}`);
      }
    }
  }
}

try {
  const input = JSON.parse(readFileSync(0, "utf8"));
  const toolName = String(input?.tool_name ?? "");
  if (toolName.startsWith("mcp__")) checkMcp(toolName, input.tool_input);
  else checkShell(String(input?.tool_input?.command ?? ""));
  process.exit(0);
} catch (error) {
  block(`the guard could not check this call (${error instanceof Error ? error.message : error})`);
}
