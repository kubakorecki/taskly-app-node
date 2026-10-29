#!/usr/bin/env bash
#
# Decides the test-agent check and whether to commit the patch, and renders the sticky PR comment.
#
#   scripts/test-agent-render.sh <dir>
#
# Reads from <dir>, where a missing or unreadable file means that step didn't finish:
#   test-agent-manifest.json, test-agent-report.json   the generate job's output
#   agent-result.json                                  the generate job's output: the CLI's last result event
#   patch-check.json                                   scripts/test-agent-apply-patch.sh, run by the publish job
#   test-agent-results.json                            scripts/test-agent-results.sh, run by the verify job
# and from the environment: RUN_URL, TRANSCRIPT_URL (may be empty), REPO_URL, AGENT (the agent step's outcome)
# and PUSH (the pushed commit's SHA, "failed", or empty before a push).
#
# Prints {"conclusion": "success" | "failure" | "neutral", "commit": bool, "title", "body"}. Exits 2 when the
# arguments are rejected.

set -euo pipefail

usage() {
  printf 'test-agent-render: %s\nusage: scripts/test-agent-render.sh <dir>\n' "$1" >&2
  exit 2
}

[[ $# -eq 1 ]] || usage 'takes one directory'
[[ -d $1 ]] || usage "no directory at $1"

# Files go in with --slurpfile: a manifest holds up to 25 patches of 64 KiB, too long for one argument.
args=()
for input in manifest:test-agent-manifest.json report:test-agent-report.json agent_result:agent-result.json \
  patch_check:patch-check.json results:test-agent-results.json; do
  file=$1/${input#*:}
  jq -e 'type == "object"' "$file" >/dev/null 2>&1 || file=/dev/null
  args+=(--slurpfile "${input%%:*}" "$file")
done

exec jq -n "${args[@]}" -f "$(dirname "$0")/test-agent-render.jq"
