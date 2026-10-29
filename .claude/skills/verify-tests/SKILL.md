---
name: verify-tests
description: Runs targeted Vitest runs with coverage through the clean-env wrapper, and iterates until the tests are green and the changed files are at 100%. Handles flaky tests and Suspected bugs. Use after writing or updating unit tests.
---

# Verify tests

## Running Vitest

Run tests only through the clean-env wrapper, from the repo root. It hides tokens from test code and rejects globs, `..` and absolute paths, so pass explicit file paths relative to the package (`tests/router.test.ts`, not `backend/tests/router.test.ts`):

```sh
scripts/agent-vitest.sh backend tests/router.test.ts tests/validators.test.ts --coverage --coverage.include=src/features/todos/router.ts --coverage.include=src/features/todos/validators.ts --coverage.reporter=text --coverage.reporter=json-summary --no-color
```

- The first argument is the package (`backend` or `frontend`). Run each package separately.
- Pass one `--coverage.include` per target source file. The text reporter prints `Uncovered Line #s`, and json-summary writes `<package>/coverage/coverage-summary.json`.
- Exit codes: 0 means green. 2 means the wrapper rejected an argument, so fix the argument. 1 is anything else Vitest reports: a failed test, a missed coverage threshold, no test file matching a path, or a config error. Read the output to tell which.

`coverage-summary.json` is keyed by absolute path, so find each file by its `/<package>/src/…` suffix. A file is done when `pct` is 100 for `statements`, `branches`, `functions` and `lines`. A file missing from the summary is excluded from coverage, so its decision should have been skip.

## Loop

The targets are the files with a create or update decision. For each package:

1. Run the target test files, with coverage on the target source files.
2. If a test is red, triage it (below), act, and re-run.
3. If a file is below 100, read its uncovered lines and add tests that reach them through the module's public behaviour. Re-run.
4. Stop when the run is green and every target is at 100, or after five runs of the package. Record any gap left at that point, or any line no test can reach, in the report with the uncovered line numbers and the reason.

Coverage is closed with tests alone. Source files, the coverage config and `v8 ignore` comments stay untouched.

Vitest strips types without checking them, and the agent can't run `tsc`. The publish job typechecks and fails on a type error, so type mocks the way the convention skills show (`vi.mocked`, `as unknown as ReturnType<…>`).

## Triage a red test

Read the failure, the test and the source, then pick one case.

- **Your test is wrong** (bad setup, wrong mock, a wrong assumption about the API): fix the test so it still asserts the intended behaviour.
- **Your test is right and the source is wrong**: the source contradicts its contract (`openapi.json`, `CONTEXT.md`, the validator limits, the types, sibling code, or the pre-PR behaviour where no Intentional behaviour change was listed). This is a Suspected bug:
  1. Copy the test code and the failure output (the assertion diff and the first stack frame in source) into the report.
  2. Take your change out of the tree. A case you added is deleted, along with its test file if that file was new and is now empty, and any helper or fixture that only it used. A case that already existed goes back to its original text.
  3. Re-run to confirm the rest is green.
- **An existing test is red because of an Intentional behaviour change** listed by `analyze-pr-changes`: edit only the assertions that encode the old behaviour, so they encode the new one, and keep the rest of the test intact. Record each edit in the report with before, after and the reason.
- **An existing test is red for any other reason**: the PR broke behaviour the test pins, so it is a Suspected bug with `existing: true`. Leave the test exactly as it was before your run and report it. The publish job's full run then goes red on it, which is the correct outcome.

Red tests you wrote are never kept: the Suspected bug is how the finding reaches the PR. Existing test cases always stay in the tree, unchanged apart from the assertion edits above. Every assertion keeps its strength: the same exact matcher and the same expected values, unless an Intentional behaviour change says otherwise.

## Run new tests twice

Once the targets are green at 100%, run each new or updated test file a second time with `--sequence.shuffle` and without coverage. A test that passes once and fails once is flaky. Make it deterministic with the convention skill's patterns (awaited `user.*` calls, fake timers, fresh state from `setup()`), then run it twice again. A case that is still flaky after that is taken out like a Suspected bug (step 2 above) and reported under `flaky`.

## Final run

For frontend targets, run Prettier on the written test files first (`frontend-unit-tests`). Then run each touched package's full suite once, with no file arguments:

```sh
scripts/agent-vitest.sh backend --coverage --coverage.reporter=text --coverage.reporter=json-summary --no-color
```

This catches tests broken by an edited shared fixture, and its summary is the agent-observed coverage for the report. Triage any red test as above.

Done when every target is green at 100% or has a recorded gap, every new test has passed twice, every Suspected bug and assertion edit is in the report, and the full suites have run.
