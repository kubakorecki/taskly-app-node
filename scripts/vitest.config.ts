import { defineConfig } from 'vitest/config';

// Tests for the test agent's workflow scripts. They live under scripts/, which the workflow pins to the base
// branch and the agent's guard never lets it write, so the agent can't weaken the tests of its own guardrails.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
