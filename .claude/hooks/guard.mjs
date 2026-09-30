#!/usr/bin/env node
// Backstop for the permission rules in .claude/settings.json (ADR 0010). This file, .claude/tools/
// and settings.json are the owner's: the agent proposes changes as a patch.
//
// Read/Edit deny rules only cover Claude's file tools. A shell command can still `cat design/…`,
// `sed -i` the settings file, or `rm -rf` outside the repo. This PreToolUse hook sees every
// Bash/PowerShell command, the hosted-Supabase MCP tools, and the GitHub merge/approve and file
// tools, and blocks those shapes too.
//
// It is a heuristic over command text, not a sandbox. The server-side backstop is branch
// protection on main. It fails CLOSED: any error in here blocks the call.
//
// Exit 2 = block (Claude Code shows stderr to the agent). Exit 0 = allow.
import { existsSync, readFileSync, realpathSync } from "node:fs";
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

// Merging and approving pull requests are the owner's. claude.ai sessions act on GitHub as the owner,
// so they would carry the owner's ruleset bypass and code-owner approval. Matched by tool name
// because the GitHub connector's server id differs per machine.
const MERGE_OR_APPROVE = /__(merge_pull_request|enable_pr_auto_merge|pull_request_review_write)$/;
// The GitHub file tools commit straight to a branch through the API, so the `git push … main` deny
// doesn't see them. A missing branch counts as main: the API then writes to the default branch.
const FILE_WRITE = /__(push_files|create_or_update_file|delete_file)$/;

function checkMcp(toolName, toolInput) {
  if (MERGE_OR_APPROVE.test(toolName))
    block(`${toolName} merges or approves a pull request; only the owner does that`);
  if (FILE_WRITE.test(toolName)) {
    const branch = String(toolInput?.branch ?? "")
      .trim()
      .replace(/^refs\/heads\//i, "");
    if (branch === "" || branch.toLowerCase() === "main")
      block(`${toolName} would commit straight to main; open a PR from a branch instead`);
  }
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
const PROTECTED_DIRS = [".claude", ".github", "design", "design-approved"].map((d) =>
  path.join(REPO, d),
);
const isProtectedDir = (p) => PROTECTED_DIRS.some((d) => inside(d, p));

// design/ is the owner's and never read. design-approved/ holds the owner's copies of the files a
// page spec is built from: the file tools may read them (settings.json), the shell may not touch
// them at all (ADR 0010, "Approved design copies").
const OWNER_DIRS = ["design", "design-approved"].map((d) => path.join(REPO, d));
const ownerDir = (p) => OWNER_DIRS.find((d) => inside(d, p));

// The visual self-check (working rule B; ADR 0010, "Visual comparison tool"): the one program with
// shell-side read access to design-approved/. It lives in .claude/tools/, which only the owner
// changes, and runs only as the root package script `visual:compare`, pinned to exactly this command.
const TOOLS_DIR = path.join(REPO, ".claude", "tools");
const VISUAL_SCRIPT = "node .claude/tools/visual-compare.mjs";
const VISUAL_DESIGN = /^[a-z0-9-]+\/[A-Za-z0-9-]+$/;
// Plain URL characters only: no $ ` ( ) ; & | < > quotes, backslash or spaces (the shell can't
// substitute, chain or redirect through it), no % (cmd.exe, which runs pnpm scripts on Windows,
// expands %VAR% even inside quotes) and no , (a PowerShell array separator).
const VISUAL_URL = /^https?:\/\/[A-Za-z0-9.\-:[\]]+(\/[A-Za-z0-9\-._~/?=+]*)?$/;
/** npm/pnpm settings that run other code in or around a script, in any spelling or file format. */
const RUN_HIJACK = /(node|script|shell)[-_]?(options|shell|emulator)/i;
/** Ways to set the environment or the program path for a later command on the same line. */
const ENV_CHANGE =
  /NODE_OPTIONS|npm_config_|pnpm_config_|NPM_CONFIG_|(^|[\s;&|])(export|set|setx|declare|typeset)\s|(^|[\s;&|])PATH=|\$env:/i;

/** Every npm/pnpm config file pnpm reads before running a script (project, user, global). */
function pnpmConfigFiles() {
  const home = os.homedir();
  const files = [
    path.join(REPO, ".npmrc"),
    path.join(REPO, "pnpm-workspace.yaml"),
    path.join(home, ".npmrc"),
    path.join(home, ".config", "pnpm", "rc"),
  ];
  if (process.env.LOCALAPPDATA)
    files.push(path.join(process.env.LOCALAPPDATA, "pnpm", "config", "rc"));
  if (process.env.XDG_CONFIG_HOME) files.push(path.join(process.env.XDG_CONFIG_HOME, "pnpm", "rc"));
  if (process.env.APPDATA) files.push(path.join(process.env.APPDATA, "npm", "etc", "npmrc"));
  for (const v of ["NPM_CONFIG_USERCONFIG", "npm_config_userconfig", "NPM_CONFIG_GLOBALCONFIG"])
    if (process.env[v]) files.push(process.env[v]);
  return files;
}

/**
 * Any segment that mentions `visual:compare` (quoted, escaped or wrapped included) must be exactly
 * `pnpm [run] visual:compare <folder>/<name> --built <url>` (either order; nothing else: no
 * redirects, no extra flags), run from the repo root with nothing set around it. The root package
 * script must still be the pinned command, with no pre/post script. Returns true for that call, so
 * the path checks skip it: its arguments are a design name and a URL, not paths. The tool
 * re-checks both itself.
 */
function checkVisualCompare(segment, words, cwd, command) {
  if (!/visual\\?:\\?compare/i.test(segment)) return false;
  // Bare `pnpm`: no VAR= prefix (NODE_OPTIONS=--require … would preload other code into the tool),
  // no env/xargs/bash -c wrapper, no pnpm flags (-C, --filter) that would pick another package.
  const [first, ...rest] = words;
  let args = rest;
  if (args[0] === "run") args = args.slice(1);
  if (first !== "pnpm" || args[0] !== "visual:compare")
    block("run the visual comparison only as `pnpm visual:compare <folder>/<name> --built <url>`");
  // pnpm runs the NEAREST package.json's script, so only from the root, whose script is pinned.
  if (path.relative(REPO, path.resolve(cwd)) !== "")
    block("run pnpm visual:compare from the repository root");
  if (ENV_CHANGE.test(command))
    block("pnpm visual:compare runs alone: nothing on the line may set the environment or PATH");
  for (const rc of pnpmConfigFiles()) {
    let text = "";
    try {
      text = readFileSync(rc, "utf8");
    } catch {
      continue; // no such file
    }
    if (RUN_HIJACK.test(text))
      block(`${rc} sets node-options/script-shell, which would run other code with the tool`);
  }
  // pnpm puts node_modules/.bin first on PATH: a `node` there would replace the real one.
  for (const bin of ["node", "node.exe", "node.cmd", "node.ps1", "node.bat"]) {
    if (existsSync(path.join(REPO, "node_modules", ".bin", bin)))
      block(`node_modules/.bin/${bin} would shadow node for the comparison tool`);
  }
  let scripts;
  try {
    scripts = JSON.parse(readFileSync(path.join(REPO, "package.json"), "utf8"))?.scripts ?? {};
  } catch {
    scripts = {};
  }
  if (scripts["visual:compare"] !== VISUAL_SCRIPT)
    block(`package.json's visual:compare must be exactly "${VISUAL_SCRIPT}" (owner-set)`);
  if (scripts["previsual:compare"] !== undefined || scripts["postvisual:compare"] !== undefined)
    block("package.json may not have a pre- or post-script around visual:compare");
  const call = args.slice(1);
  const at = call.indexOf("--built");
  const url = at >= 0 ? call[at + 1] : undefined;
  const others = call.filter((_, i) => i !== at && i !== at + 1);
  if (call.length !== 3 || !url || !VISUAL_URL.test(url) || !VISUAL_DESIGN.test(others[0] ?? ""))
    block("pnpm visual:compare takes <folder>/<name> --built <url> and nothing else");
  return true;
}

/** git's `--no-index` / `--untracked`, abbreviations included (git accepts unambiguous prefixes). */
const READS_OUTSIDE_INDEX = /^--(no-in|unt)/;

/** `/usr/bin/grep`, `grep.exe` → `grep`. */
const baseCmd = (w) =>
  path
    .basename(w ?? "")
    .replace(/\.exe$/i, "")
    .toLowerCase();

/** The command a segment really runs, past env/xargs/sudo/busybox… and VAR=value. */
function unwrap(words) {
  let i = 0;
  while (
    i < words.length &&
    (WRAPPERS.test(baseCmd(words[i])) ||
      baseCmd(words[i]) === "busybox" ||
      /^\w+=/.test(words[i]) ||
      (i > 0 && words[i].startsWith("-")))
  )
    i += 1;
  return words.slice(i);
}

/**
 * A recursive content search reads design/ without naming it. `grep -r` ignores .gitignore; `rg`
 * honours it unless told not to; `git grep --no-index`/`--untracked` reads untracked files. Blocked
 * when its root is design/, design-approved/ or a folder above either. With no existing path
 * named, the root is where the shell is. Roots are resolved through symlinks, since grep and rg
 * follow a symlink named on the command line. A heuristic, like the rest of this file.
 */
function checkRecursiveSearch(words, cwd) {
  const [first, ...rest] = unwrap(words);
  const cmd = baseCmd(first);
  let args = rest;
  const has = (re) => args.some((a) => re.test(a));
  let recursive = false;
  if (cmd === "rgrep") recursive = true;
  else if (/^[ef]?grep$/.test(cmd)) {
    recursive =
      // GNU getopt takes any unambiguous prefix of a long option (`--recursiv`, `--direc=recurse`).
      has(/^-[a-zA-Z]*[rR]/) ||
      has(/^--(rec|der)/) ||
      has(/^(--dir[a-z]*=|-d)recurse$/) ||
      args.some((a, i) => /^(-d|--dir[a-z]*)$/.test(a) && args[i + 1] === "recurse");
  } else if (cmd === "rg") {
    recursive = has(/^-[a-zA-Z]*u/) || has(/^--(no-ignore|unrestricted)/);
  } else if (cmd === "git" && args.includes("grep")) {
    recursive = has(READS_OUTSIDE_INDEX);
    args = args.slice(args.indexOf("grep") + 1);
  }
  if (!recursive) return;
  const roots = args
    .filter((a) => !a.startsWith("-"))
    .map((a) => resolveArg(a, cwd))
    .filter((p) => p && existsSync(p))
    .flatMap((p) => {
      try {
        return [p, realpathSync.native(p)];
      } catch {
        return [p];
      }
    });
  for (const root of roots.length ? roots : [cwd]) {
    if (OWNER_DIRS.some((d) => inside(root, d) || inside(d, root)))
      block(
        `${cmd} searches ${path.relative(REPO, root) || "the repo root"} recursively, which reaches design/; search a subfolder instead`,
      );
  }
}

/**
 * Files that decide what rg (and git) ignore. A line like `!design/` in one of them would make a
 * plain `rg` read design/ again, so only the owner changes them.
 */
const IGNORE_FILE = (p) =>
  /^\.(rgignore|ignore)$/.test(path.basename(p)) || p === path.join(REPO, ".gitignore");

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

const WRAPPERS = /^(env|command|exec|sudo|nohup|time|xargs)$/;
const SHELLS = /^(ba|z|da)?sh$|^(pwsh|powershell)(\.exe)?$/i;

/** `gh pr merge`, `gh pr review` and `gh api` (a merge is a REST/GraphQL call too), also behind env/xargs. */
function checkGh(words) {
  let i = 0;
  while (
    i < words.length &&
    (WRAPPERS.test(words[i]) || /^\w+=/.test(words[i]) || (i > 0 && words[i].startsWith("-")))
  )
    i += 1;
  if (!/(^|[/\\])gh(\.exe)?$/i.test(words[i] ?? "")) return;
  const args = words.slice(i + 1);
  if (args.find((a) => !a.startsWith("-")) === "api")
    block("gh api can merge, approve or change protection; only the owner does that");
  for (let j = 0; j < args.length - 1; j += 1) {
    if (args[j] === "pr" && /^(merge|review)$/.test(args[j + 1]))
      block(`gh pr ${args[j + 1]}: merging and approving pull requests are the owner's`);
  }
}

function checkShell(rawCommand, startCwd) {
  // Where the shell really is (the Bash tool keeps its folder between calls); the repo if unknown.
  let cwd = startCwd ? path.resolve(toNative(String(startCwd))) : REPO;
  // A backslash-newline continues the line in bash: join it, so the continued words are checked
  // as arguments of the same command rather than as a new, unchecked command name.
  const command = rawCommand.replace(/\\\r?\n/g, " ");

  for (const segment of segments(command)) {
    const words = tokens(segment);
    const [cmd = "", ...args] = words;

    checkGh(words);
    if (checkVisualCompare(segment, words, cwd, command)) continue;
    // `bash -c "gh pr merge 1"`, `env bash -lc "grep -r x ."`: the inner command gets every check.
    const [shell = "", ...shellArgs] = unwrap(words);
    const c = shellArgs.findIndex((a) => /^-[a-z]*c$|^-Command$/i.test(a));
    if (SHELLS.test(baseCmd(shell)) && c >= 0 && shellArgs[c + 1])
      checkShell(shellArgs[c + 1], cwd);

    // A search can be made to read ignored files without any flag.
    if (/RIPGREP_CONFIG_PATH/.test(segment))
      block("RIPGREP_CONFIG_PATH can turn off rg's ignore rules; only the owner sets it");
    checkRecursiveSearch(words, cwd);

    // Commit messages and PR text mention paths without touching them, and design/ is gitignored.
    // Except a git command that reads outside the index: those get the path checks below.
    if (/^(git|gh)$/.test(cmd) && !args.some((a) => READS_OUTSIDE_INDEX.test(a))) continue;

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

    // 1. design/ is the owner's. Never read, modified or committed. design-approved/ is for the
    //    file tools only, and for the one comparison tool, which runs only as `pnpm visual:compare`.
    for (const [raw, p] of resolved([...plainArgs, ...redirectTargets])) {
      const dir = p && ownerDir(p);
      if (dir) block(`${path.basename(dir)}/ is off limits to the shell (${raw})`);
      if (p && inside(TOOLS_DIR, p))
        block(
          `.claude/tools/ is the owner's; run the comparison only as pnpm visual:compare (${raw})`,
        );
    }

    // 2. The loop never modifies its own guardrails: permissions, hooks, CI.
    const guarded = (p) =>
      p &&
      (inside(path.join(REPO, ".github"), p) ||
        inside(path.join(REPO, ".claude", "hooks"), p) ||
        inside(TOOLS_DIR, p) ||
        /^settings(\.local)?\.json$/.test(path.relative(path.join(REPO, ".claude"), p)) ||
        IGNORE_FILE(p));
    for (const [raw, p] of resolved(redirectTargets)) {
      if (guarded(p)) block(`writing ${raw} is human-gated`);
    }
    if (WRITE_VERB.test(segment)) {
      for (const [raw, p] of resolved(plainArgs)) {
        if (guarded(p)) block(`changing ${raw} is human-gated`);
      }
    }

    // 2b. The comparison's renders show real brands, and the repository is public (ADR 0008): they
    //     are never copied into it. A heuristic, like the rest (an interpreter could still copy).
    if (
      /autoverse-visual-/i.test(segment) &&
      (WRITE_VERB.test(segment) || redirectTargets.length)
    ) {
      for (const [raw, p] of resolved([...plainArgs, ...redirectTargets])) {
        if (p && inside(REPO, p) && !/autoverse-visual-/i.test(raw))
          block(`the comparison renders stay out of the repository (${raw})`);
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
  else checkShell(String(input?.tool_input?.command ?? ""), input?.cwd);
  process.exit(0);
} catch (error) {
  block(`the guard could not check this call (${error instanceof Error ? error.message : error})`);
}
