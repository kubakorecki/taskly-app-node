# Solution: unit test agent and PR workflow

A custom Claude Code agent (`unit-test-agent`) with five skills writes and updates Vitest unit tests for the backend and frontend. A GitHub Actions workflow (`test-agent`) runs it on pull requests. It checks the agent's work independently, commits the tests to the PR branch and reports on the PR with a sticky comment and a `test-agent` check. The same workflow runs a Backfill run on demand. The two Backfill runs added 66 backend tests (#3) and 96 frontend tests (#5).

Terms (Test agent, PR run, Backfill run, Test decision, Intentional behaviour change, Suspected bug) are defined in [`CONTEXT.md`](CONTEXT.md).

## Decisions

- **Claude Code as the agent environment.** The agent and skills are plain files in `.claude/`, so they're reviewed and versioned like code. CI and a developer's machine run the same definition. Opus 5.5 (`claude-opus-5-5`) at high effort was chosen for test quality and effective judgment calls. To enable testing of other models a Backfill run can pick another model with the `model` input.
- **The agent only writes tests** ([ADR 0001](docs/adr/0001-agent-writes-tests-workflow-owns-side-effects.md)). The agent reads untrusted PR content, so it can be prompt-injected or simply wrong. Its tools can't push, comment or reach the network, so a compromised agent can at worst produce a bad patch. Deterministic steps catch that before anything ships. The one exception is the token risk under Limitations: test code the agent writes can read the Claude token.
- **The agent typechecks its own tests; the workflow's typecheck stays the gate** ([ADR 0003](docs/adr/0003-agent-typechecks-through-clean-env-wrapper.md)). The agent runs `scripts/agent-tsc.sh <backend|frontend>` once its targets are green at 100% and fixes type errors in any test file. A type error in source stays the author's to fix: the agent names the file in its summary. Its clean typecheck is a claim like any other, so `verify` still runs both typechecks.
- **Three jobs, split by trust** ([ADR 0002](docs/adr/0002-github-app-token-for-agent-commits.md)). Running test code is the dangerous step: it can plant git hooks or step environment variables that later steps would run. So no job both holds a write token and runs PR or agent code.
  - `generate` has the Claude token and `contents: read`. It runs the agent and uploads a patch, the report and the transcript.
  - `verify` has no secrets. It runs PR and agent code: both suites with coverage, both typechecks and `format:check`.
  - `publish` holds the GitHub App token and runs no PR or agent code. It re-checks the patch, commits it and reports.
- **GitHub App token for the agent's commit** ([ADR 0002](docs/adr/0002-github-app-token-for-agent-commits.md)). A push with `GITHUB_TOKEN` doesn't trigger other workflows, so CI would never check the agent's commit. A fine-grained PAT would trigger CI, but it's long-lived and tied to a person. The App token is short-lived and scoped to this one repo.
- **Defence in depth around the agent:**
  - A guard hook (`scripts/agent-guard.sh`) allows writes only to test files and Bash only for three wrapper scripts, so the agent can't edit source or run arbitrary commands. `scripts/agent-tsc.sh` is allowed only as `backend` or `frontend`, with no other arguments.
  - `--allowedTools` with `--permission-mode dontAsk` is a second layer in case the hook is misconfigured or bypassed.
  - Hook via `--settings` + count check: in an untrusted CI checkout, frontmatter hooks silently don't run. Comparing guard checks to tool calls proves the guard actually ran, instead of assuming it did.
  - The workflow swaps the agent files, scripts and `CLAUDE.md` back to the base branch's version, so a PR can't rewrite the agent's rules or hooks and then review itself. The workflow file itself still comes from the PR, because that's how the `pull_request` trigger works. So a PR can change the workflow, including this step. Moving the secrets into a GitHub Environment (see For production) closes this gap.
  - Vitest, Prettier and tsc run through clean-env wrappers (`scripts/agent-vitest.sh`, `scripts/agent-prettier.sh`, `scripts/agent-tsc.sh`), so test code and Prettier plugins don't see the tokens in their environment. tsc only reads files and runs no PR code, but it goes through the same wrapper for consistency and in case it ever loads PR code.
- **Publish guards.** The patch may only touch `backend/tests/**`, `frontend/src/**/*.test.ts(x)` and `frontend/src/test/**` (not `setup.ts`). No file may lose tests: tests are counted per file with `vitest list`. The commit message is fixed, so agent text can't add `[skip ci]`.
- **Commit only when everything is green.** Red tests are never committed. A test that fails because the source looks wrong becomes a Suspected bug in the comment, with the test code and the failure output.
- **Stateless runs.** Every run covers the whole PR diff against the base branch. Runs are grouped per PR and cancel in progress. Loops are prevented by skipping events sent by bots and by a `[test-agent]` trailer.
- **Target: 100% per-file coverage on changed files, plus a checklist.** Coverage alone doesn't prove good tests, so both convention skills carry a mandatory edge-case and security checklist. It covers boundary lengths, unknown fields and `__proto__`, bad IDs, leaky errors, HTML rendered as text, and error, loading and disabled states. Each item gets a test or a recorded exemption.
- **Assertions only change for a reason.** An existing assertion may change only for an Intentional behaviour change from the diff. Every edit the agent reports is listed in the comment with its diff. Nothing checks yet that it reports all of them (see For production).
- **Infrastructure failures are neutral.** A missing artifact, a patch that doesn't apply or a failed push sets the `test-agent` check to neutral, not failure, so a flaky runner doesn't block a PR.

## Running it

### Prerequisites

- A GitHub repo with Actions enabled, and a repo admin with `gh` logged in.
- A Claude subscription to generate `CLAUDE_CODE_OAUTH_TOKEN` (`claude setup-token`).
- The workflow and agent files on the base branch. PR runs use the base branch's agent files, so a PR that adds the agent can't test itself. The workflow file itself comes from the PR.

### One-time setup

```sh
scripts/setup-test-agent.sh
```

The wizard walks you through the steps:

1. Create a GitHub App with `contents:write`, `pull-requests:write` and `checks:write`, installed on this repo only.
2. Store the `TEST_AGENT_APP_ID` variable and the `TEST_AGENT_APP_PRIVATE_KEY` and `CLAUDE_CODE_OAUTH_TOKEN` secrets.
3. Protect `main` so it requires PRs and the `backend`, `frontend` and `test-agent-scripts` CI checks.
4. Create the `skip-test-agent` label.

Re-running it is safe.

### Use

- **PR run:** open or push to a non-draft PR from a branch in this repo. It also runs on `reopened` and `ready_for_review`. The `skip-test-agent` label opts a PR out. Fork PRs get a notice in the run instead.
- **Backfill run:** `gh workflow run test-agent.yml -f scope=backend` (or `frontend`, optionally `-f model=...`). It commits to `test-agent/backfill-<scope>` and opens a PR with the report as its body. To go past the 25-file cap, dispatch again on that branch.
- **Local run:** `claude --agent unit-test-agent` in a trusted checkout. Name the source files or a scope in the message.

## Agent and skills

| File | Role |
| --- | --- |
| `.claude/agents/unit-test-agent.md` | The agent: model, tools, guard hook, modes (PR, Backfill, local), the process and the hard rules. |
| `.claude/skills/analyze-pr-changes/SKILL.md` | Reads `test-agent-manifest.json`, maps each source file to its test file and makes a Test decision (create, update or skip, with a reason) with a rubric. Finds Intentional behaviour changes in the diff. |
| `.claude/skills/backend-unit-tests/SKILL.md` | Backend conventions: Vitest and Supertest, the Prisma `vi.spyOn` pattern, `tests/fixture.ts`, and the checklist. |
| `.claude/skills/frontend-unit-tests/SKILL.md` | Frontend conventions: RTL with `userEvent`, the QueryClient wrapper, fetch mocking, `src/test/todoFixture.ts`, Prettier, and the checklist. |
| `.claude/skills/verify-tests/SKILL.md` | Targeted Vitest runs with coverage through the wrapper. Loops until green and at 100%, typechecks each touched package and fixes type errors in test files, runs new tests again shuffled to catch flakiness, and turns source bugs into Suspected bugs. |
| `.claude/skills/test-report/SKILL.md` | The JSON schema of `test-agent-report.json`, which the workflow renders into the comment. |

The agent has no Skill tool, so all five skills are preloaded through `skills:` in its frontmatter. The agent file orders them: analyze, write tests with the package's convention skill, verify, report.

The workflow is `.github/workflows/test-agent.yml`. Its scripts are in `scripts/`:

- `test-agent-manifest.sh` builds the manifest: classification, per-file patch, coverage baseline and the 25-file cap.
- `test-agent-apply-patch.sh` applies the patch and runs the path and test-count guards.
- `test-agent-results.sh` collects the check results.
- `test-agent-render.sh` and `test-agent-render.jq` render the verdict and comment.

The guard, the wrappers and these scripts have tests in `scripts/tests/`, which the agent can't write, so it can't weaken the tests of its own guardrails. `.github/workflows/ci.yml` runs both packages' typecheck and coverage, and these script tests (`test-agent-scripts`), on every PR and on `main`.

## Example run: the Doing status feature (#9)

[PR #9](https://github.com/kubakorecki/taskly-app-node/pull/9) replaces a task's `completed` flag with a Status of Open, Doing or Done, across the Prisma model, validators, mapper, OpenAPI, frontend types, utils, components and filters. It was opened **without tests** (`7ea2c06`), so the existing tests were stale and the new code was uncovered: 17 backend and 19 frontend tests failed before the agent's commit.

**Run** ([41047996227](https://github.com/kubakorecki/taskly-app-node/actions/runs/41047996227), [transcript](https://github.com/kubakorecki/taskly-app-node/actions/runs/41047996227/artifacts/12973103558), [comment](https://github.com/kubakorecki/taskly-app-node/pull/9#issuecomment-6521674862)): ✅ "63 tests added, all checks passed", on the first run.

- **Timing:** `generate` 9m10s (the agent about 8m15s), `verify` 51s, `publish` 15s.
- **Agent:** 82 tool calls: 36 Read, 11 Edit, 12 Write, 11 Grep or Glob, 12 Bash. The guard blocked two calls, a Grep over the repo root and an `echo noop`, and the agent carried on. The other 11 Bash calls were the wrappers.
- **Its own typecheck:** this is the same type error that stopped the first run on an earlier PR (#6), before the agent could typecheck. The agent changed the backend fixture's `record` to `status: 'open'`, and its first `scripts/agent-tsc.sh backend` reported `tests/fixture.ts(8,14): error TS2322` on `status`. It added `status: 'open'` to `todo`, and the second typecheck was clean. `agent-tsc.sh frontend` was clean the first time. Every test change in the PR is the agent's.
- **Skills:**
  - `analyze-pr-changes` made the decisions: **update** for 11 files and **skip** for `frontend/src/features/todos/types.ts` (types-only). Each decision has a reason, for example "TodoList.tsx: functions 40%: onToggle replaced by onStatusChange forwarding the task and status".
  - It also found the Intentional behaviour change: `completed` replaced by `status`, which defaults to `open`, and a Task is Active when not Done.
  - `backend-unit-tests` and `frontend-unit-tests` drove the new cases. Checklist items appear as tests such as "rejects the legacy completed field in patches and responses", "rejects prototype keys in create and update input: %s", "renders HTML in the title and description as text" and "disables every control while busy".
  - `verify-tests` ran targeted coverage runs per package, typechecked both packages, reran each package's tests shuffled, and finished with a full-suite run per package.
  - `test-report` wrote the report that became the comment.
- **Beyond the targets:** the agent also fixed test files the PR had left stale but didn't list as targets: `backend/tests/fixture.ts`, `router.test.ts`, `src/test/todoFixture.ts`, `useTodoFilters.test.ts` and `useUpdateTodoMutation.test.tsx`. Each edited assertion is listed in the comment with its diff and the Intentional behaviour change behind it. Its summary also names `backend/src/factory.ts` (not in this PR), which stays at 95.45% statements.
- **Verification by the workflow, not the agent:** both typechecks passed, `format:check` passed, backend 148 tests and frontend 141 passed. The test count went from 226 to 289. No Suspected bugs, no flaky tests.
- **Coverage before → after:** every target ends at 100/100/100/100. The ones below 100 before (statements / branches / functions / lines):

  | File | Before |
  | --- | --- |
  | `TodosPage.tsx` | 78.57 / 87.5 / 81.81 / 81.48 |
  | `TodoItem.tsx` | 66.66 / 100 / 50 / 66.66 |
  | `TodoFilters.tsx` | 50 / 100 / 50 / 50 |
  | `TodoList.tsx` | 40 / 100 / 40 / 40 |
  | `repository.ts` | 100 / 91.66 / 100 / 100 |

- **Commit:** [`74b345c`](https://github.com/kubakorecki/taskly-app-node/commit/74b345cacd3abe6a4e20f155c710263f99558459) "Add unit tests from the test agent", by `taskly-app-node-test-agent[bot]` with the `[test-agent]` trailer. It touches 16 files, +530/−95.
- **After the commit:** `ci` ran on the bot's commit (`backend`, `frontend` and `test-agent-scripts` pass), the `test-agent` check passed, and #9 is mergeable. It's left open for review.

## Assumptions

- PRs come from branches in this repo. Forks are out of scope.
- "Unit tests" means the Vitest suites the repo already has. The backend spies on Prisma and never needs a database, and the frontend uses jsdom.
- 100% per-file coverage on changed files, plus the checklist, is a useful bar for "the changed code is tested".
- The PR author owns the source code. The agent never fixes source. It reports Suspected bugs, and a human reviews the agent's commit before merging.
- Domain language follows `CONTEXT.md`: tests say Task and Status even though the code still says `Todo`.
- GitHub-hosted `ubuntu-latest` runners. Claude Code is pinned to 2.1.312.

## Limitations

- **Type errors in source block the commit.** The agent fixes type errors in test files, but never edits source. A PR whose own code doesn't typecheck fails `verify`, so nothing is committed, and the agent only names the file in its summary.
- **Size and budget caps.** A run takes at most 25 source files, 40 turns and 30 minutes. Larger PRs get a partial run and list the rest as skipped.
- **Stateless and repeated.** Every push reruns the agent over the whole diff. This costs more than an incremental run, but tests the agent committed earlier become existing tests that it must keep.
- **Accepted security risks** (see [ADR 0002](docs/adr/0002-github-app-token-for-agent-commits.md)):
  - Test code runs as the same user as Claude Code and could read the Claude token from `/proc/<pid>/environ`. `generate` refuses to upload output that contains the token as plain text. But it can't spot an encoded token, for example in base64, hidden in a test file, the report or the transcript. The workflow would then publish it in the commit, the PR comment or the transcript artifact. `generate` also can't stop test code from sending the token over the network.
  - Agent tests run in `verify` before the per-file test counts are collected, so they could tamper with them.
- **All bot senders are skipped.** The workflow can't name the App without a slug variable, so dependency-bump PRs get no tests either.
- **CI thresholds are not at 100% yet.** The agent works to 100% on the files it touches, but `ci.yml` still enforces the original thresholds (issue 11).
- **LLM output varies.** The same PR can get different tests on a rerun. The guards make sure only test files change and that they pass, not that the tests are good, so review is still needed.

## For production

- **Consider using `ANTHROPIC_API_KEY`** from an organisation account with usage tracking, instead of `CLAUDE_CODE_OAUTH_TOKEN`, which is tied to a personal subscription and can easily run into rate limits.
- **Run all PR and agent code as a separate user or in a container.** This means `npm ci` install scripts, Vitest and Prettier, so none of them can read the Claude process's environment. Code that can't read the token can't leak it, so this closes the leak through test code. It doesn't stop a PR from changing the workflow file to read the token directly: the GitHub Environment below fixes that.
- **Restrict egress** (outgoing network traffic) in `generate` and `verify`. Allow only `api.anthropic.com` and the npm registry, for example with a firewalled self-hosted runner or an egress-blocking action. This stops test code from sending the token or other data straight to another server. On its own it isn't enough: the token could still leak through the commit or the PR comment, because the workflow posts those itself.
- **Move the secrets into a GitHub Environment.** Repository secrets can be read by any workflow on any branch, so anyone with write access can push a branch with their own workflow and steal the Claude token and the App key. Put them in a `test-agent` environment that only `main` and `develop` can use, or that needs a trusted person's approval, and add `environment: test-agent` to `generate` and `publish`. With the branch rule, PR runs need `pull_request_target`, which runs the workflow from the base branch.
- **Cap the spend.** Anyone with write access can drain the budget by opening many PRs or pushing again and again, because each run is capped but the number of runs isn't. Give the API key its own Console workspace with a monthly spend limit, and skip runs once a PR or author has had too many that day.
- **Check assertion edits in the workflow.** The comment lists only the edits the agent reports itself, and nothing compares the old and new test files. So the agent could weaken an existing test without anyone noticing outside the commit diff: change an expected value, delete an `expect`, add `it.skip`, or change a shared fixture. The test-count guard doesn't catch this, because the tests still exist. Let `publish` diff every existing test file, flag changed lines the report doesn't list, and fail when more tests are skipped than before.
- **Limit what test code can do.** After merge, the agent's tests run on every developer's machine and in `ci.yml`. The guards check where files are and that tests pass, not what the code does. The path guard also allows any file in the test folders, including `.js` files, dotfiles and a nested `node_modules/`. Allow only `.ts` and `.tsx` files, and add an ESLint rule for test files that blocks `child_process`, `fs`, `net` and `process.env`, checked in `verify`.
- **Make coverage a gate.** The `test-agent` check shows ✅ even when a target stays below 100%, as long as the agent wrote down why. Fail or warn when the verified coverage of a target is below 100%.
- **Sandbox local runs.** Locally, the agent's tests run right away on the developer's machine. The wrappers remove secrets from the environment, but test code can still read files like `~/.ssh` or `~/.aws`. Run local sessions in a container, for example a dev container.
- **Consider fork support.** Fork PRs would need the agent to run untrusted code with the Claude key. Gate it behind a maintainer approval, such as a label or an environment with required reviewers, and only after the egress and user-isolation changes above.
- **Add a repo variable for the App's slug** so only the App is skipped. Currently any bot is skipped.
- **Switch `create-github-app-token` from `app-id` to `client-id`.** GitHub now recommends the Client ID for identifying an App.
- **Track tokens and cost per run**, so unusual spending gets noticed early.
- **Run incrementally.** Only cover what changed since the agent's last commit, to cut repeat cost on long-lived PRs.