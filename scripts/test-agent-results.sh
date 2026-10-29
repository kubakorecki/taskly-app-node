#!/usr/bin/env bash
#
# Prints the verify job's results as JSON, for the publish job to render (scripts/test-agent-render.sh).
#
#   scripts/test-agent-results.sh <dir>
#
# Reads from <dir>, for each package that ran:
#   <package>-list-before.json, <package>-list-after.json   vitest list --json at head and with the patch
#   <package>-vitest.json                                    Vitest's json reporter, from the run with coverage
#   checks/<check>.exit, checks/<check>.log                  exit code and output of each check
# and coverage from <package>/coverage/coverage-summary.json in the repo the current directory is in. A check
# with no exit code reports "did not run" and fails. Missing or unreadable lists make the test count unknown.
# Exits 2 when the arguments are rejected or it runs outside a git repository.

set -euo pipefail

checks=(backend-typecheck backend-tests frontend-typecheck frontend-format frontend-tests)

usage() {
  printf 'test-agent-results: %s\nusage: scripts/test-agent-results.sh <dir>\n' "$1" >&2
  exit 2
}

[[ $# -eq 1 ]] || usage 'takes one directory'
[[ -d $1 ]] || usage "no directory at $1"
dir=$(cd "$1" && pwd -P)
root=$(git rev-parse --show-toplevel) || usage 'run it inside a git repository'
cd "$root"
root=$(pwd -P)

# Prints {file: count} from a vitest list, or null when it's missing or not JSON.
counts() {
  jq --arg prefix "$root/" 'group_by(.file) | map({key: (.[0].file | ltrimstr($prefix)), value: length}) | from_entries' "$1" 2>/dev/null ||
    echo null
}

# Every package with a list must have both, or the counts are unknown.
test_counts() {
  local package before after
  for package in backend frontend; do
    [[ -f $dir/$package-list-before.json || -f $dir/$package-list-after.json ]] || continue
    before=$(counts "$dir/$package-list-before.json")
    after=$(counts "$dir/$package-list-after.json")
    jq -n --argjson before "$before" --argjson after "$after" '{before: $before, after: $after}'
  done | jq -s '
    if length > 0 and all(.before != null and .after != null) then
      (map(.before) | add) as $before | (map(.after) | add) as $after
      | [$before | to_entries[] | {file: .key, before: .value, after: ($after[.key] // 0)} | select(.after < .before)] as $decreased
      | {status: (if $decreased == [] then "ok" else "decreased" end),
         before: ($before | add // 0), after: ($after | add // 0), decreased: $decreased}
    else {status: "unknown", before: null, after: null, decreased: []} end'
}

check_results() {
  local check results
  for check in "${checks[@]}"; do
    if [[ ! -f $dir/checks/$check.exit ]]; then
      jq -n --arg name "${check/-/ }" '{name: $name, ok: false, summary: "did not run", log: null}'
      continue
    fi
    results=$dir/${check%-tests}-vitest.json
    [[ $check == *-tests && -f $results ]] || results=/dev/null
    jq -n --arg name "${check/-/ }" --argjson exit "$(<"$dir/checks/$check.exit")" --arg kind "${check#*-}" \
      --rawfile log "$dir/checks/$check.log" --slurpfile vitest "$results" '
      # The last 50 lines, at most 3000 characters, without colours.
      ($log | gsub("\u001b\\[[0-9;]*m"; "") | rtrimstr("\n") | split("\n") | .[-50:] | join("\n") + "\n" | .[-3000:]) as $tail
      | if $kind != "tests" then {ok: ($exit == 0), summary: (if $exit == 0 then "passed" else "failed" end)}
        elif $vitest == [] then {ok: false, summary: "no results"}
        else $vitest[0] as $v
          # A run whose tests pass but whose coverage misses a threshold still exits 1.
          | {ok: ($v.success and $v.numFailedTests == 0),
             summary: ([
               "\($v.numPassedTests) passed",
               (select($v.numFailedTests > 0) | "\($v.numFailedTests) failed"),
               (($v.numPendingTests + $v.numTodoTests) | select(. > 0) | "\(.) skipped"),
               (select($exit != 0 and $v.success and $v.numFailedTests == 0) | "coverage below the thresholds")
             ] | join(", "))}
        end
      | {name: $name} + . + {log: (if $exit == 0 then null else $tail end)}'
  done | jq -s .
}

coverage() {
  local summary
  for summary in {backend,frontend}/coverage/coverage-summary.json; do
    [[ ! -f $summary ]] || jq --arg prefix "$root/" '
      del(.total) | with_entries({key: (.key | ltrimstr($prefix)),
        value: {statements: .value.statements.pct, branches: .value.branches.pct, functions: .value.functions.pct, lines: .value.lines.pct}})' "$summary"
  done | jq -s 'add // {}'
}

jq -n --argjson testCounts "$(test_counts)" --argjson checks "$(check_results)" --argjson coverage "$(coverage)" \
  '{version: 1, testCounts: $testCounts, checks: $checks, coverage: $coverage}'
