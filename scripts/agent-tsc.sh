#!/usr/bin/env bash
#
# Typechecks a package for the test agent in the same clean environment as scripts/agent-vitest.sh, so tsc can't
# hand CLAUDE_CODE_OAUTH_TOKEN, GITHUB_TOKEN or any other secret to code it loads (docs/adr/0003).
#
#   scripts/agent-tsc.sh <backend|frontend>
#
# Exits with tsc's exit code, or 2 with an "agent-tsc:" message when the arguments are rejected. tsc itself also
# exits 2 when it finds a type error.

set -euo pipefail

usage() {
  printf 'agent-tsc: %s\nusage: scripts/agent-tsc.sh <backend|frontend>\n' "$1" >&2
  exit 2
}

[[ $# -eq 1 ]] || usage 'takes exactly one argument, the package'
package=$1
[[ $package == backend || $package == frontend ]] || usage "unknown package: $package"

cd "$(dirname "$0")/../$package"

clean_env=()
for name in PATH HOME CI NODE_OPTIONS TZ; do
  if [[ -n ${!name+set} ]]; then clean_env+=("$name=${!name}"); fi
done

# --no stops npx from downloading TypeScript when it isn't installed.
exec env -i ${clean_env[@]+"${clean_env[@]}"} npx --no tsc --noEmit
