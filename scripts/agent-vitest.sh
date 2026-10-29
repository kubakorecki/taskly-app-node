#!/usr/bin/env bash
#
# Runs Vitest for the test agent in a clean environment, so test code can't
# read CLAUDE_CODE_OAUTH_TOKEN, GITHUB_TOKEN or any other secret.
#
#   scripts/agent-vitest.sh <backend|frontend> [vitest args…]
#
# Exits with Vitest's exit code, or 2 when the arguments are rejected.

set -euo pipefail

usage() {
  printf 'agent-vitest: %s\nusage: scripts/agent-vitest.sh <backend|frontend> [vitest args…]\n' "$1" >&2
  exit 2
}

[[ $# -ge 1 ]] || usage 'missing package'
package=$1
shift
[[ $package == backend || $package == frontend ]] || usage "unknown package: $package"

for arg in "$@"; do
  # Allow-list the characters Vitest args need, so shell metacharacters never get through.
  [[ $arg =~ ^[A-Za-z0-9\ ._/=:,@+-]*$ ]] || usage "disallowed character in argument: $arg"
  # Keep paths inside the package: no "..", and no absolute path anywhere in a list or option value.
  if [[ $arg == *..* || $arg =~ (^|[=,:@\ ])/ ]]; then usage "path outside the package: $arg"; fi
done

cd "$(dirname "$0")/../$package"

clean_env=()
for name in PATH HOME CI NODE_OPTIONS TZ; do
  if [[ -n ${!name+set} ]]; then clean_env+=("$name=${!name}"); fi
done

# --no stops npx from downloading Vitest when it isn't installed.
exec env -i ${clean_env[@]+"${clean_env[@]}"} npx --no vitest run "$@"
