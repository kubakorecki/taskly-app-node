#!/usr/bin/env bash
#
# Formats frontend test files for the test agent in a clean environment, so a Prettier config or
# plugin from the PR can't read CLAUDE_CODE_OAUTH_TOKEN, GITHUB_TOKEN or any other secret.
#
#   scripts/agent-prettier.sh <frontend test file…>
#
# Paths are relative to the repo root. Exits with Prettier's exit code, or 2 when the arguments are rejected.

set -euo pipefail

usage() {
  printf 'agent-prettier: %s\nusage: scripts/agent-prettier.sh <frontend test file…>\n' "$1" >&2
  exit 2
}

[[ $# -ge 1 ]] || usage 'missing file'

files=()
for arg in "$@"; do
  # Only test files, and only the characters paths need, so options and shell metacharacters never get through.
  [[ $arg =~ ^frontend/src/[A-Za-z0-9._/-]+\.test\.tsx?$ || $arg =~ ^frontend/src/test/[A-Za-z0-9._/-]+\.tsx?$ ]] ||
    usage "not a frontend test file: $arg"
  [[ $arg != *..* ]] || usage "path outside the package: $arg"
  files+=("${arg#frontend/}")
done

cd "$(dirname "$0")/../frontend"

clean_env=()
for name in PATH HOME CI NODE_OPTIONS TZ; do
  if [[ -n ${!name+set} ]]; then clean_env+=("$name=${!name}"); fi
done

exec env -i ${clean_env[@]+"${clean_env[@]}"} node_modules/.bin/prettier --write "${files[@]}"
