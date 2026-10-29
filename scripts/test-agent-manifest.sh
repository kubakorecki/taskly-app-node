#!/usr/bin/env bash
#
# Prints the test agent's change manifest as JSON. The schema lives in .claude/skills/analyze-pr-changes.
#
#   scripts/test-agent-manifest.sh pr <base> <head>              files changed in base...head
#   scripts/test-agent-manifest.sh backfill <backend|frontend>   source files in the package below 100%
#
# Coverage comes from <package>/coverage/coverage-summary.json, so run the package's tests with json-summary
# coverage first. Run from inside the repo. Exits 1 on a git or coverage error, or 2 when the arguments are rejected.

set -euo pipefail

max_targets=25
max_patch=65536
# The four percentages of one file in a coverage-summary.json entry.
metrics='{statements: .statements.pct, branches: .branches.pct, functions: .functions.pct, lines: .lines.pct}'

usage() {
  printf 'test-agent-manifest: %s\nusage: scripts/test-agent-manifest.sh pr <base> <head>\n       scripts/test-agent-manifest.sh backfill <backend|frontend>\n' "$1" >&2
  exit 2
}

fail() {
  printf 'test-agent-manifest: %s\n' "$1" >&2
  exit 1
}

# Matched with case, where * also matches /.
kind() {
  case $1 in
    backend/tests/* | frontend/src/test/* | frontend/src/*.test.ts | frontend/src/*.test.tsx) echo test ;;
    backend/src/*.ts) echo backend ;;
    frontend/src/*.ts | frontend/src/*.tsx) echo frontend ;;
    .github/* | .gitignore | */.gitignore | package.json | */package.json | package-lock.json | */package-lock.json | \
      */tsconfig*.json | *.config.ts | */Dockerfile | */nginx.conf | */.prettierrc* | */.prettierignore | \
      docker-compose*.yml | backend/prisma/*) echo config ;;
    *) echo other ;;
  esac
}

# Prints the file's four coverage percentages from its package's summary, or null when it isn't measured.
coverage() {
  local summary=${1%%/*}/coverage/coverage-summary.json
  [[ -f $summary ]] || { echo null; return; }
  jq --arg key "$root/$1" ".[\$key] // null | if . then $metrics else . end" "$summary"
}

commit_sha() {
  git rev-parse --quiet --verify "$1^{commit}" || fail "unknown revision: $1"
}

# Keeps the first $max_targets source files that still exist, in path order, and moves the rest to overflow.
cap() {
  jq --argjson max "$max_targets" '
    ([.files[] | select((.kind == "backend" or .kind == "frontend") and .change != "deleted") | .path] | .[$max:]) as $overflow
    | .files |= map(select(.path | IN($overflow[]) | not))
    | .overflow = $overflow'
}

pr_manifest() {
  local base head status file previous change file_kind file_coverage
  base=$(commit_sha "$1")
  head=$(commit_sha "$2")
  while IFS= read -r -d '' status; do
    IFS= read -r -d '' file
    previous=''
    case $status in
      R*) previous=$file; IFS= read -r -d '' file; change=renamed ;;
      A) change=added ;;
      D) change=deleted ;;
      *) change=modified ;;
    esac
    file_kind=$(kind "$file")
    file_coverage=null
    if [[ ($file_kind == backend || $file_kind == frontend) && $change != deleted ]]; then file_coverage=$(coverage "$file"); fi
    # Only the hunks: the agent has the paths already, and the diff header repeats them.
    git --literal-pathspecs diff --no-color -M "$base...$head" -- ${previous:+"$previous"} "$file" | sed -n '/^@@/,$p' >"$tmp/patch"
    jq -n --arg path "$file" --arg kind "$file_kind" --arg change "$change" --arg previous "$previous" \
      --rawfile patch "$tmp/patch" --argjson coverage "$file_coverage" --argjson max "$max_patch" '
      {path: $path, kind: $kind, change: $change}
      + (if $previous == "" then {} else {previousPath: $previous} end)
      + {patch: (if ($patch | length) > $max then $patch[:$max] + "\n[patch truncated at \($max) characters]" else $patch end),
         coverage: $coverage}'
  done < <(git diff --no-color --name-status -z -M "$base...$head") >"$tmp/files"
  jq -s --arg base "$base" --arg head "$head" '{mode: "pr", base: $base, head: $head, files: sort_by(.path)}' "$tmp/files" | cap
}

backfill_manifest() {
  local scope=$1 summary=$1/coverage/coverage-summary.json
  [[ -f $summary ]] || fail "no coverage summary at $summary: run the $scope tests with json-summary coverage first"
  jq --arg scope "$scope" --arg prefix "$root/" --arg head "$(commit_sha HEAD)" '
    {mode: "backfill", scope: $scope, base: null, head: $head, files: [
      to_entries[] | select(.key | startswith($prefix + $scope + "/src/"))
      | {path: (.key | ltrimstr($prefix)), kind: $scope, change: "unchanged", patch: null,
         coverage: (.value | '"$metrics"')}
      | select(.coverage | any(. != 100))
    ] | sort_by(.path)}' "$summary" | cap
}

case ${1-} in
  pr) [[ $# -eq 3 ]] || usage 'pr takes a base and a head revision' ;;
  backfill) [[ $# -eq 2 && ($2 == backend || $2 == frontend) ]] || usage 'backfill takes a scope: backend or frontend' ;;
  *) usage "unknown mode: ${1-}" ;;
esac

root=$(git rev-parse --show-toplevel) || fail 'not inside a git repository'
cd "$root"
root=$(pwd -P)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

if [[ $1 == pr ]]; then pr_manifest "$2" "$3"; else backfill_manifest "$2"; fi
