#!/usr/bin/env bash
# Claude Code PreToolUse hook (matcher: Bash). Rejects `git checkout -b`, `git switch -c`
# and `git branch <name>` when the new branch does not follow the convention in AGENTS.md:
#   <type>/TRA-<n>-<short-title>   e.g. feat/TRA-123-trip-list
# Exit 0 with no output = allow. Stdin: hook JSON; stdout: permission decision JSON.
set -euo pipefail

cmd="$(jq -r '.tool_input.command // empty')"
[ -n "$cmd" ] || exit 0

types='feat|fix|refactor|build|ci|docs|infra|test|chore'
pattern="^($types)/TRA-[0-9]+-[a-z0-9]+(-[a-z0-9]+)*$"

# Collect every branch name being created in the command (handles `a && b` chains and
# options before -b/-c such as `git checkout -q -b`). `git branch -d/-m/-a ...` yields a
# flag as the last token and is skipped.
names="$(printf '%s\n' "$cmd" \
  | grep -oE 'git[[:space:]]+((checkout([[:space:]]+-[[:alnum:]=-]+)*[[:space:]]+-[bB])|(switch([[:space:]]+-[[:alnum:]=-]+)*[[:space:]]+-[cC])|branch)[[:space:]]+[^[:space:];&|]+' \
  | awk '{print $NF}' \
  | tr -d "\"'" \
  | grep -vE '^-' || true)"
[ -n "$names" ] || exit 0

for name in $names; do
  if ! [[ "$name" =~ $pattern ]]; then
    reason="Branch name '$name' does not follow the convention <type>/TRA-<n>-<short-title>"
    reason+=" (types: $types; lowercase slug). Every branch belongs to a Linear issue:"
    reason+=" look it up with the Linear MCP or ask the user for the key, then rename,"
    reason+=" e.g. feat/TRA-123-trip-list."
    jq -cn --arg r "$reason" '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: $r}}'
    exit 0
  fi
done
exit 0
