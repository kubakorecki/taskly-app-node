# The test agent typechecks its own tests through a clean-env wrapper

Vitest strips types without checking them, so before this the first type error the agent's tests met was the verify job's typecheck, and a run with every test green and every target at 100% could still go uncommitted over a one-line type error. The agent now runs `scripts/agent-tsc.sh <backend|frontend>` and fixes its own type errors. This amends `docs/adr/0001`, which says the agent can only read, edit and run Vitest: it can now run tsc too (and Prettier on test files, through `scripts/agent-prettier.sh`). The verify job's typecheck stays the gate, since the agent's clean run is a claim like any other.

tsc only reads files and runs no PR code, so it is less exposed than Vitest, which the agent already runs with PR code loaded. It still goes through the same `env -i` wrapper and environment allow-list as `scripts/agent-vitest.sh`, for consistency and in case tsc ever loads code from the PR. The wrapper takes the package and nothing else, so the agent can't point tsc at another project or config, and `npx --no` keeps it from downloading a compiler.

## Considered Options

- **`npm run typecheck`**: rejected because the script comes from the PR's `package.json`, which would let the PR choose what the agent runs.
