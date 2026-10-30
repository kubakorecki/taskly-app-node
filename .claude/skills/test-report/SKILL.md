---
name: test-report
description: The JSON schema of the test agent's report and how to write `test-agent-report.json`. Use when recording Test decisions, tests written, assertion edits, checklist exemptions, Suspected bugs or coverage.
---

# Test report

The report is the one file the agent writes that isn't a test file. It is workflow output, never committed, and the workflow renders it into the sticky PR comment. Write it with the Write tool to `test-agent-report.json` at the repo root, replacing the whole file each time.

## When to write

1. After `analyze-pr-changes`, before any test is written: `finished: false`, with the decisions and the Intentional behaviour changes, and every other array empty.
2. After `verify-tests`: the full report with `finished: true`.

A run that is cut short (turn limit, timeout) leaves the first version behind, and `finished: false` tells the workflow the rest is missing.

## Schema

```ts
type Metrics = { statements: number; branches: number; functions: number; lines: number } // pct, 0 to 100

type TestAgentReport = {
  version: 1
  mode: 'pr' | 'backfill' // copied from the manifest
  finished: boolean
  summary: string // one or two plain sentences: what was tested, what was found, and any source file left with a type error
  decisions: Array<{
    sourceFile: string // path from the manifest
    decision: 'create' | 'update' | 'skip'
    reason: string
    testFile: string | null // null for skip
  }>
  intentionalChanges: Array<{
    id: string // short kebab-case slug: 'status-replaces-completed'
    description: string
    files: string[]
    evidence: string
  }>
  tests: Array<{
    testFile: string
    newFile: boolean
    added: string[] // titles of new test cases
    updated: string[] // titles of existing test cases that changed
  }>
  editedAssertions: Array<{
    testFile: string
    test: string // test title
    before: string // the old assertion, verbatim
    after: string // the new assertion, verbatim
    intentionalChange: string // id from intentionalChanges
    reason: string
  }>
  checklistExemptions: Array<{
    sourceFile: string
    item: 1 | 2 | 3 | 4 | 5 | 6 // number in the convention skill's checklist
    reason: string // why the item doesn't apply to this file
  }>
  suspectedBugs: Array<{
    sourceFile: string
    testFile: string
    test: string // test title
    existing: boolean // true when an existing test went red, false for a test the agent took out
    explanation: string // what the source does versus what its contract says
    code: string // the test code, verbatim
    output: string // the failure output, at most 4000 characters
  }>
  flaky: Array<{ testFile: string; test: string; output: string }> // taken out after failing one of two runs
  agentObservedCoverage: Array<{
    sourceFile: string // every target source file
    coverage: Metrics // from the final run's coverage-summary.json
    uncovered: string | null // uncovered line numbers from the text reporter, null at 100
    reason: string | null // why the gap remains, null at 100
  }>
}
```

## Rules

- All paths are relative to the repo root (`backend/tests/router.test.ts`).
- Every field is present. Arrays with nothing to report are `[]`.
- Text fields are plain text. The workflow escapes them and shows `code`, `output`, `before` and `after` in code blocks.
- Coverage here is what the agent observed. The publish job's own run is the verified result.

Done when the file parses as JSON, `decisions` meets the completion criterion of `analyze-pr-changes`, and every test case the agent added, edited or took out appears in `tests`, `editedAssertions`, `suspectedBugs` or `flaky`.
