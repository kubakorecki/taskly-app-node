# Agent commits are pushed with a GitHub App token, not GITHUB_TOKEN

Commits pushed with the workflow's own `GITHUB_TOKEN` don't trigger other workflows. That would leave the PR head with no CI checks right after the test agent commits, and the 100% coverage gate would never be evaluated on the agent's work. We push with a short-lived installation token from a single-repo GitHub App (`contents:write`, `pull-requests:write`, and `checks:write` for the `test-agent` check) instead. Loops are prevented by skipping runs whose sender is a GitHub Bot account, which the app is, and by a `[test-agent]` trailer on its commits. The workflow can't name the app without a repo variable for its slug, and other bots' PRs (dependency bumps) don't need generated tests.

## Considered Options

- **Fine-grained PAT**: rejected because it is long-lived and tied to a person's account.
- **`GITHUB_TOKEN` with the agent workflow posting its own check**: rejected because it duplicates CI logic and the regular `ci.yml` gate would not run on the agent's commit.
