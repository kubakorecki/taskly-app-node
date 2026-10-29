#!/usr/bin/env bash
#
# Applies the test agent's patch to the index and working tree, then checks every changed path. Only new or
# modified regular files under backend/tests/, frontend/src/test/ (except the Vitest setup file) or named
# frontend/src/**/*.test.ts(x) are allowed: the paths the agent's guard lets it write (scripts/agent-guard.sh).
#
#   scripts/test-agent-apply-patch.sh <patch>
#
# Prints {"files": [...], "violations": [{"path", "reason"}]} for the repo the current directory is in. Exits 1
# when there are violations (the patch stays applied), 3 when the patch doesn't apply (nothing is staged), or 2
# when the arguments are rejected or it runs outside a git repository.

set -euo pipefail

usage() {
  printf 'test-agent-apply-patch: %s\nusage: scripts/test-agent-apply-patch.sh <patch>\n' "$1" >&2
  exit 2
}

[[ $# -eq 1 ]] || usage 'takes one patch file'
[[ -f $1 ]] || usage "no patch at $1"
patch=$(cd "$(dirname "$1")" && pwd -P)/$(basename "$1")
root=$(git rev-parse --show-toplevel) || usage 'run it inside a git repository'
cd "$root"

# Matched with case, where * also matches /.
violation() {
  local meta=$1 path=$2 mode status
  read -r _ mode _ _ status <<<"$meta"
  if [[ $status == D ]]; then echo deleted; return; fi
  if [[ $mode != 100644 ]]; then echo 'not a regular file'; return; fi
  case $path in
    frontend/src/test/setup.ts) echo 'the Vitest setup file' ;;
    backend/tests/* | frontend/src/test/* | frontend/src/*.test.ts | frontend/src/*.test.tsx) ;;
    *) echo 'outside the test paths' ;;
  esac
}

# git apply refuses an empty patch.
if [[ -s $patch ]] && ! git apply --index "$patch"; then
  echo 'test-agent-apply-patch: the patch does not apply' >&2
  exit 3
fi

# --raw -z gives ":<old mode> <new mode> <old sha> <new sha> <status>" and the path as two fields.
result=$(
  while IFS= read -r -d '' meta; do
    IFS= read -r -d '' path
    jq -n --arg path "$path" --arg reason "$(violation "$meta" "$path")" '{path: $path, reason: $reason}'
  done < <(git diff --cached --no-renames --raw -z) |
    jq -s '{files: map(.path), violations: map(select(.reason != ""))}'
)
printf '%s\n' "$result"
jq -e '.violations == []' <<<"$result" >/dev/null || exit 1
