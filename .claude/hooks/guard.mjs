#!/usr/bin/env node
// Backstop for the permission rules in .claude/settings.json (ADR 0010).
//
// Read/Edit deny rules only cover Claude's file tools. A shell command can still `cat design/…`,
// `sed -i` the settings file, or `rm -rf` outside the repo. This PreToolUse hook sees every
// Bash/PowerShell command and blocks those shapes too.
//
// Exit 2 = block (Claude Code shows stderr to the agent). Anything else = allow.
import { readFileSync } from "node:fs";
import path from "node:path";

const REPO = path.resolve(import.meta.dirname, "..", "..");

const input = JSON.parse(readFileSync(0, "utf8"));
const command = String(input?.tool_input?.command ?? "");

function block(reason) {
  process.stderr.write(`BLOCKED by guard: ${reason}\nThis needs the human — see ADR 0010.\n`);
  process.exit(2);
}

// 0. The settings.json matcher only routes hosted-database MCP tools here (the connector's server
//    id differs per machine, so it is matched by tool name). Every one of them is denied.
if (String(input?.tool_name ?? "").startsWith("mcp__")) {
  block(`${input.tool_name} reaches the hosted Supabase project`);
}

// 1. design/ is the owner's. Never read, modified or committed (CLAUDE.md / PROGRESS.md decisions).
if (/(^|[\s'"=(])(\.[\\/])?design[\\/]/.test(command)) {
  block("design/ is off limits unless a spec explicitly lifts it");
}

// 2. The loop never modifies its own guardrails: permissions, hooks, CI.
const PROTECTED = /\.claude[\\/](settings(\.local)?\.json|hooks[\\/])|\.github[\\/]/;
const WRITES =
  /(\bsed\s+(-\w*\s+)*-i|\bperl\s+-\w*i|\btee\b|\b(mv|cp|rm|truncate|install)\s|\b(Set|Add|Clear)-Content\b|\bOut-File\b|\b(Remove|Move|Copy|New|Rename)-Item\b|\bgit\s+(checkout|restore)\s)/i;
const REDIRECT_INTO =
  />>?\s*['"]?[^\s'"]*(\.claude[\\/](settings(\.local)?\.json|hooks[\\/])|\.github[\\/])/;
if ((PROTECTED.test(command) && WRITES.test(command)) || REDIRECT_INTO.test(command)) {
  block("changing .claude/settings*, .claude/hooks/ or .github/ is human-gated");
}

// 3. No deleting outside the repository.
const DELETE = /(?:^|[;&|]\s*)(?:rm|rmdir|Remove-Item|del|rd)\b([^;&|]*)/gi;
for (const [, args] of command.matchAll(DELETE)) {
  for (const raw of args.trim().split(/\s+/)) {
    const arg = raw.replace(/^['"]|['"]$/g, "");
    if (!arg || arg.startsWith("-")) continue;
    if (/^(~|\$HOME|\$env:|%)/i.test(arg)) block(`delete outside the repo: ${arg}`);
    // Git Bash spells D:\x as /d/x.
    const native = arg.replace(/^\/([a-z])\//i, "$1:/");
    const target = path.resolve(REPO, native);
    const rel = path.relative(REPO, target);
    if (rel.startsWith("..") || path.isAbsolute(rel)) block(`delete outside the repo: ${arg}`);
  }
}

process.exit(0);
