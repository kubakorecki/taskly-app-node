#!/usr/bin/env bash
#
# PreToolUse hook for the test agent (.claude/agents/unit-test-agent.md). Claude Code passes the tool
# call as JSON on stdin; exit 0 lets it through, exit 2 blocks it with the reason on stderr.
#
#   Read, Glob, Grep  inside the repo, except .env files
#   Edit, Write       test and fixture files (not the Vitest setup file), plus test-agent-report.json
#   Bash              scripts/agent-vitest.sh or scripts/agent-prettier.sh with plain arguments
#
# Any other tool is blocked. Only an explicit allow exits 0, so bad input or a missing jq fails closed.

root=$(cd "$(dirname "$0")/.." && pwd -P)

block() {
  printf 'agent-guard: %s\n' "$1" >&2
  exit 2
}

# Prints the path made absolute (relative paths start at the repo root) with directory symlinks
# resolved. Fails on "..", a leading "~", and a symlink that isn't an existing directory.
resolve() {
  local path=$1 dir rest=''
  [[ -n $path && $path != '~'* && ! $path =~ (^|/)\.\.(/|$) ]] || return 1
  [[ $path == /* ]] || path=$root/$path
  dir=$path
  until [[ -d $dir ]]; do
    [[ ! -L $dir ]] || return 1
    rest=/${dir##*/}$rest
    dir=$(dirname "$dir")
  done
  dir=$(cd "$dir" && pwd -P) || return 1
  printf '%s%s\n' "${dir%/}" "$rest"
}

# Prints the path relative to the repo root, or fails when it resolves outside the repo.
repo_path() {
  local real
  real=$(resolve "$1") || return 1
  [[ $real == "$root"/* ]] || return 1
  printf '%s\n' "${real#"$root"/}"
}

readable() {
  local rel name
  rel=$(repo_path "$1") || return 1
  name=${rel##*/}
  [[ $name == .env.example || ( $name != .env && $name != .env.* ) ]]
}

writable() {
  local rel
  rel=$(repo_path "$1") || return 1
  # setup.ts is the frontend's Vitest setupFiles entry: config in a test folder.
  [[ $rel != frontend/src/test/setup.ts ]] || return 1
  [[ $rel == test-agent-report.json || $rel == backend/tests/* || $rel == frontend/src/test/* ||
     $rel == frontend/src/*.test.ts || $rel == frontend/src/*.test.tsx ]]
}

# Glob patterns are matched below the search path, so they only need to stay relative and skip .env files.
safe_pattern() {
  [[ $1 != /* && $1 != '~'* && $1 != *..* && $1 != *.env* ]]
}

command -v jq >/dev/null || block 'jq is required'
input=$(cat)
tool=$(jq -r '.tool_name // "" | strings' <<<"$input" 2>/dev/null) || block 'tool call is not JSON'
field() { jq -r --arg key "$1" '.tool_input[$key] // "" | strings' <<<"$input"; }

case $tool in
  Read)
    readable "$(field file_path)" && exit 0
    block 'Read is limited to files inside the repo, except .env files' ;;
  Glob | Grep)
    path=$(field path) pattern=$(field pattern) glob=$(field glob)
    [[ -z $path ]] || readable "$path" || block "$tool is limited to paths inside the repo, except .env files"
    if [[ $tool == Glob ]]; then safe_pattern "$pattern" || block 'Glob patterns must be relative, without .. or .env'; fi
    [[ -z $glob ]] || safe_pattern "$glob" || block 'Grep globs must be relative, without .. or .env'
    exit 0 ;;
  Edit | Write)
    writable "$(field file_path)" && exit 0
    block "$tool is limited to test files (backend/tests/**, frontend/src/**/*.test.ts(x), frontend/src/test/** except setup.ts) and test-agent-report.json" ;;
  Bash)
    command_pattern='^(\./)?scripts/agent-(vitest|prettier)\.sh( [A-Za-z0-9._/=:,@+-]+)*$'
    [[ $(field command) =~ $command_pattern ]] && exit 0
    block 'Bash runs only scripts/agent-vitest.sh or scripts/agent-prettier.sh, with plain space-separated arguments' ;;
  *)
    block "$tool is not on the test agent's tool list" ;;
esac
