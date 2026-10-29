# The program behind scripts/test-agent-render.sh. $manifest, $report, $patch_check and $results each come in as
# the slurped file, empty when it's missing, and are rebound to the parsed file or null.

def plural($n; $word): "\($n) \($word)\(if $n == 1 then "" else "s" end)";
def capitalize: (.[:1] | ascii_upcase) + .[1:];
def lowercase_first: (.[:1] | ascii_downcase) + .[1:];
def sentence_list: if length < 2 then join("") else (.[:-1] | join(", ")) + " and " + .[-1] end;

# Text from the agent or the PR as one line of markdown that can't format, link, run HTML or mention anyone.
def esc:
  . // "" | tostring
  | gsub("&"; "&amp;") | gsub("<"; "&lt;") | gsub(">"; "&gt;")
  | gsub("(?<c>[\\\\`*_\\[\\]|#~$])"; "\\\(.c)")
  | gsub("@"; "@\u2060")
  | gsub("\\s*\n\\s*"; " ");
# A file path as inline code, unless it holds what would break out of a code span or a table cell.
def path: . // "" | tostring | if test("[`|\n]") then esc else "`\(.)`" end;
# A fenced code block, with a fence longer than any run of backticks inside it.
# The limit is not called $max: a $name parameter also defines name as a filter, which would hide max.
def code($lang; $limit):
  (. // "" | tostring | .[:$limit] | rtrimstr("\n")) as $text
  | ([range([$text | scan("`+") | length] + [2] | max + 1)] | map("`") | join("")) as $fence
  | "\($fence)\($lang)\n\($text)\n\($fence)";
# Indents a block into a list item, leaving blank lines blank.
def indent: "  " + gsub("\n(?=.)"; "\n  ");
def details($summary): "<details><summary>\($summary)</summary>\n\n\(.)\n\n</details>";
def pcts:
  if . == null then "not measured"
  else [.statements, .branches, .functions, .lines] as $pct
    | (if all($pct[]; . == 100) then "✅ " else "" end) + ($pct | map(tostring) | join(" / "))
  end;

$manifest[0] as $manifest
| ($report[0] | if . != null and .version == 1 then . else null end) as $report
| $patch_check[0] as $patch_check
| $results[0] as $results
| [$manifest.files[]? | select((.kind == "backend" or .kind == "frontend") and .change != "deleted")] as $targets
| ($report.suspectedBugs // []) as $bugs
| [$results.checks[]? | select(.ok | not) | .name] as $failed
| ($patch_check.files // [] | length > 0) as $changed
| ($ENV.PUSH // "") as $push

# Anything here stops the commit.
| (if $manifest == null then {conclusion: "neutral", title: "The test agent's output is missing"}
   elif $targets == [] then {conclusion: "success", title: "No source files to test"}
   elif $report == null then {conclusion: "neutral", title: "The test agent wrote no report"}
   elif $patch_check == null then {conclusion: "neutral", title: "The patch does not apply"}
   elif ($patch_check.violations // []) != [] then {conclusion: "failure", title: "The patch changes files outside the test paths"}
   elif $results == null then {conclusion: "neutral", title: "The verification did not finish"}
   elif $results.testCounts.status == "decreased" then {conclusion: "failure", title: "The patch removes tests"}
   elif $results.testCounts.status != "ok" then {conclusion: "failure", title: "The tests could not be counted"}
   elif $failed != [] then {conclusion: "failure", title: "\($failed | sentence_list | capitalize) failed"}
   else null end) as $blocked
| ($blocked == null and $changed) as $commit
| (($results.testCounts.after // 0) - ($results.testCounts.before // 0)) as $added
| (if $blocked != null then $blocked
   elif $push == "failed" then {conclusion: "neutral", title: "The push failed"}
   elif $bugs != [] then {conclusion: "failure", title: plural($bugs | length; "Suspected bug")}
   elif $added > 0 then {conclusion: "success", title: "\(plural($added; "test")) added, all checks passed"}
   elif $changed then {conclusion: "success", title: "Tests updated, all checks passed"}
   else {conclusion: "success", title: "No test changes, all checks passed"} end) as $verdict

| ($report.decisions // [] | map({key: (.sourceFile | tostring), value: .}) | from_entries) as $decisions
| ($report.intentionalChanges // [] | map({key: (.id | tostring), value: .description}) | from_entries) as $intentional

| "<!-- test-agent -->\n### Test agent: \({success: "✅", failure: "❌", neutral: "⚪"}[$verdict.conclusion]) \($verdict.title)" as $header

| (if $manifest == null or $targets == [] then [] else [
    ($report.summary | select(. != null) | esc),

    (select($report.finished == false or $ENV.AGENT == "failure")
      | "> [!WARNING]\n> The test agent stopped before it finished (turn limit or timeout), so this report is partial."),

    "#### Test decisions",
    ([ "| Source file | Decision | Test file | Reason |", "| --- | --- | --- | --- |",
       ($targets[] | $decisions[.path] as $d
         | "| \(.path | path) | \($d.decision // "none" | esc) | \(if $d.testFile then $d.testFile | path else "" end) | \($d.reason // "The run stopped before deciding." | esc) |")
     ] | join("\n")),
    ($manifest.overflow // [] | select(. != []) | "Over the 25-file cap, so not tested in this run: \(map(path) | join(", "))"),

    ($report.tests // [] | select(. != []) | "#### Tests written", (map(
      "- \(.testFile | path)\(if .newFile then " (new file)" else "" end)"
      + ([(.added // [])[] | "\n  - Added: \(esc)"] + [(.updated // [])[] | "\n  - Updated: \(esc)"] | join(""))
    ) | join("\n"))),

    ($report.editedAssertions // [] | select(. != []) | "#### Edited assertions", (map(
      "- \(.testFile | path): \(.test | esc). \($intentional[.intentionalChange | tostring] // .intentionalChange | esc) \(.reason | esc)\n\n"
      + ([(.before // "" | tostring | .[:2000] | split("\n")[] | "- \(.)"), (.after // "" | tostring | .[:2000] | split("\n")[] | "+ \(.)")]
         | join("\n") | code("diff"; 4000) | indent)
    ) | join("\n\n"))),

    "#### Verification",
    (if $patch_check == null then "The patch does not apply to the head commit."
     else "Results from this workflow's own run of both suites with coverage, the typechecks and `format:check`, with the patch applied.",
       ($patch_check.violations // [] | select(. != []) | "The patch was rejected:\n\n\(map("- \(.path | path): \(.reason | esc)") | join("\n"))")
     end),
    (if $patch_check == null then empty
     elif $results == null then "The verification did not finish."
     else
       ([ "| Check | Result |", "| --- | --- |",
          ($results.checks[] | "| \(.name | capitalize | esc) | \(if .ok then "✅" else "❌" end) \(.summary | esc) |"),
          ($results.testCounts | "| Test count | \(if .status == "ok" then "✅" else "❌" end) \(if .before == null then "could not be counted" else "\(.before) before, \(.after) after" end) |")
        ] | join("\n")),
       ($results.testCounts.decreased // [] | select(. != []) | map("- \(.file | path): \(plural(.before; "test")) before, \(.after) after") | join("\n")),
       ($results.checks[] | select(.log != null) | .name as $name | .log | code(""; 4000) | details("\($name | capitalize | esc) output"))
     end),

    "#### Coverage of changed files",
    "Statements / branches / functions / lines, in %. Before is the head commit with its own tests, after adds the patch.",
    ([ "| File | Before | After |", "| --- | --- | --- |",
       ($targets[] | "| \(.path | path) | \(.coverage | pcts) | \($results.coverage[.path] | pcts) |")
     ] | join("\n")),

    ($bugs | select(. != []) | "#### Suspected bugs", (map(
      "- \(.sourceFile | path): \(.test | esc) (\(if .existing then "existing test in \(.testFile | path)" else "new test, not committed" end)). \(.explanation | esc)\n\n"
      + ("\(.code | code("ts"; 4000))\n\n\(.output | code(""; 4000))" | details("Test and failure output") | indent)
    ) | join("\n\n"))),

    ($report.flaky // [] | select(. != []) | "#### Flaky tests, taken out", (map(
      "- \(.testFile | path): \(.test | esc)\n\n" + (.output | code(""; 2000) | details("Output") | indent)
    ) | join("\n\n")))
  ] end) as $sections

| ([ "[Workflow run](\($ENV.RUN_URL))",
     (($ENV.TRANSCRIPT_URL // "") | select(. != "") | "[Agent transcript](\(.))"),
     (if $push | test("^[0-9a-f]{40}$") then "Commit [`\($push[:7])`](\($ENV.REPO_URL)/commit/\($push))"
      elif $push == "failed" then "Not committed: the push failed"
      elif $blocked != null then "Not committed: \($blocked.title | lowercase_first)"
      elif $changed | not then "Not committed: the agent changed no tests"
      else "Not committed" end)
   ] | join(" · ")) as $footer

| ([$header] + $sections + [$footer] | join("\n\n") + "\n") as $body
| {
    conclusion: $verdict.conclusion,
    commit: $commit,
    title: $verdict.title,
    # GitHub takes up to 65536 characters.
    body: (if ($body | length) <= 60000 then $body
           else $body[:60000] + "\n\nThe comment was cut at 60000 characters. The [workflow run](\($ENV.RUN_URL)) has the full report in its test-agent-output artifact.\n" end)
  }
