# Agent commits are pushed with a GitHub App token, not GITHUB_TOKEN

Commits pushed with the workflow's own `GITHUB_TOKEN` don't trigger other workflows. That would leave the PR head with no CI checks right after the test agent commits, and the 100% coverage gate would never be evaluated on the agent's work. We push with a short-lived installation token from a single-repo GitHub App (`contents:write`, `pull-requests:write`, and `checks:write` for the `test-agent` check) instead. Loops are prevented by skipping runs whose sender is a GitHub Bot account, which the app is, and by a `[test-agent]` trailer on its commits. The workflow can't name the app without a repo variable for its slug, and other bots' PRs (dependency bumps) don't need generated tests.

The token is minted only in the `publish` job, which runs no code from the PR or the agent. The suites run with the agent's patch in a separate `verify` job with no secrets, because test code that runs in a job can plant git hooks or step environment variables that later steps holding the token would run. `publish` applies and checks the patch itself and only reports `verify`'s results. Those results are not trusted: the agent's tests run in `verify` before they're collected and could rewrite them. CI re-runs the suites on the pushed commit, but the per-file test count is checked nowhere else, so a test that tampers with it is an accepted risk.

## Considered Options

- **Fine-grained PAT**: rejected because it is long-lived and tied to a person's account.
- **`GITHUB_TOKEN` with the agent workflow posting its own check**: rejected because it duplicates CI logic and the regular `ci.yml` gate would not run on the agent's commit.
