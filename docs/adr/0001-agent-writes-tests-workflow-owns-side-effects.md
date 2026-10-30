# The test agent only writes test files; the workflow owns every side effect

The PR test agent runs between two deterministic workflow steps. Before it runs, the workflow computes the PR diff manifest and coverage baseline. After it runs, the workflow rejects any change outside test and fixture files, re-runs the full suites and typecheck independently, commits, and posts the PR comment. The agent itself can only read, edit and run Vitest. It has no git, gh or network access and never sees a token with write scope.

We chose this over letting the agent commit and comment directly. An LLM reading untrusted PR content can be prompt-injected or simply wrong, so nothing it claims ("tests pass", "only tests changed") is trusted until a step it can't influence has verified it.

The agent also typechecks and formats its tests, through the same kind of clean-env wrapper as Vitest (`docs/adr/0003`).
