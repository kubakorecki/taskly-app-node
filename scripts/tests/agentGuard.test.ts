import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { rmSync, symlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, expect, it } from 'vitest';

// scripts/agent-guard.sh is the test agent's PreToolUse hook: exit 0 lets a tool call through, exit 2 blocks it.
const guard = fileURLToPath(new URL('../agent-guard.sh', import.meta.url));
const root = fileURLToPath(new URL('../..', import.meta.url)).replace(/\/$/, '');
const fileLink = `backend/tests/agent-guard-link-${randomUUID()}.ts`;
const dirLink = `backend/tests/agent-guard-dir-${randomUUID()}`;
const hostsLink = `backend/tests/agent-guard-hosts-${randomUUID()}`;
const danglingLink = `backend/tests/agent-guard-dangling-${randomUUID()}`;
const call = (tool_name: string, tool_input: Record<string, unknown>) =>
  spawnSync(guard, { input: JSON.stringify({ hook_event_name: 'PreToolUse', tool_name, tool_input }), encoding: 'utf8', timeout: 10_000 });

beforeAll(() => {
  symlinkSync('../src/factory.ts', `${root}/${fileLink}`);
  symlinkSync('../src', `${root}/${dirLink}`);
  symlinkSync('/etc/hosts', `${root}/${hostsLink}`);
  symlinkSync('/no-such-dir', `${root}/${danglingLink}`);
});
afterAll(() => [fileLink, dirLink, hostsLink, danglingLink].forEach((link) => rmSync(`${root}/${link}`, { force: true })));

it.each([
  `${root}/backend/tests/router.test.ts`, `${root}/backend/tests/fixture.ts`, `${root}/backend/tests/new/nested.test.ts`,
  `${root}/frontend/src/features/todos/components/TodoItem.test.tsx`, `${root}/frontend/src/features/todos/utils.test.ts`,
  `${root}/frontend/src/test/todoFixture.ts`, `${root}/test-agent-report.json`, 'backend/tests/relative.test.ts',
])('lets the agent write test file %s', (file_path) => {
  expect(call('Write', { file_path, content: '' }).status).toBe(0);
  expect(call('Edit', { file_path, old_string: 'a', new_string: 'b' }).status).toBe(0);
});

it.each([
  'backend/src/factory.ts', 'backend/vitest.config.ts', 'backend/package.json', 'frontend/src/features/todos/utils.ts',
  'frontend/vite.config.ts', 'frontend/.prettierrc', 'frontend/node_modules/x/a.test.ts', 'backend/node_modules/x/a.test.ts',
  'scripts/agent-vitest.sh', 'scripts/agent-guard.sh', 'scripts/tests/agentGuard.test.ts', '.claude/agents/unit-test-agent.md', '.claude/settings.json',
  '.github/workflows/ci.yml', 'test-agent-manifest.json', 'backend/tests/../src/factory.ts', 'frontend/src/test/../App.tsx',
  'backend/tests/..', '/etc/passwd', '/tmp/x.test.ts', `${root}-evil/backend/tests/a.test.ts`, `${root}/../x/backend/tests/a.test.ts`,
  'frontend/src/test/setup.ts', fileLink, `${dirLink}/new.test.ts`, `${danglingLink}/a.test.ts`, '~/a.test.ts', '',
].map((path) => (path.startsWith('/') || path.startsWith('~') || path === '' ? path : `${root}/${path}`)))('blocks writing %s', (file_path) => {
  for (const tool of ['Write', 'Edit']) {
    const { status, stderr } = call(tool, { file_path });
    expect(stderr).toContain('agent-guard:');
    expect(status).toBe(2);
  }
});

it.each([
  ['Read', { file_path: `${root}/backend/src/factory.ts` }], ['Read', { file_path: `${root}/test-agent-manifest.json` }],
  ['Read', { file_path: `${root}/CONTEXT.md` }], ['Read', { file_path: `${root}/.env.example` }],
  ['Glob', { pattern: '**/*.test.ts', path: `${root}/backend` }], ['Glob', { pattern: 'frontend/src/**/*.tsx' }],
  ['Grep', { pattern: 'completed', path: `${root}/frontend/src` }], ['Grep', { pattern: 'completed' }],
  ['Grep', { pattern: 'completed', glob: '*.test.ts' }],
])('lets the agent read the repo with %s %j', (tool, input) => {
  expect(call(tool, input).status).toBe(0);
});

it.each([
  ['Read', { file_path: '/etc/passwd' }], ['Read', { file_path: '/proc/self/environ' }], ['Read', { file_path: `${root}/.env` }],
  ['Read', { file_path: `${root}/backend/.env` }], ['Read', { file_path: `${root}/.env.local` }], ['Read', { file_path: `${root}/../x` }],
  ['Read', { file_path: `${root}/${hostsLink}` }], ['Read', {}], ['Glob', { pattern: '/etc/*' }], ['Glob', { pattern: '../**' }],
  ['Glob', { pattern: '*', path: '/' }], ['Grep', { pattern: 'x', path: '/proc' }], ['Grep', { pattern: 'x', path: `${root}/.env` }],
  ['Read', { file_path: '~/.ssh/id_rsa' }], ['Glob', { pattern: '*', path: '~' }], ['Glob', { pattern: '**/.env*' }],
  ['Grep', { pattern: 'x', glob: '.env*' }], ['Grep', { pattern: 'x', glob: '/etc/*' }], ['Grep', { pattern: 'x', glob: '../*' }],
])('blocks reading outside the repo or secrets with %s %j', (tool, input) => {
  const { status, stderr } = call(tool, input);
  expect(stderr).toContain('agent-guard:');
  expect(status).toBe(2);
});

it.each([
  'scripts/agent-vitest.sh backend tests/router.test.ts --coverage --coverage.include=src/features/todos/router.ts --coverage.reporter=text --coverage.reporter=json-summary --no-color',
  './scripts/agent-vitest.sh frontend', 'scripts/agent-vitest.sh backend tests/router.test.ts --sequence.shuffle',
  'scripts/agent-prettier.sh frontend/src/features/todos/components/TodoItem.test.tsx frontend/src/test/todoFixture.ts',
  'scripts/agent-tsc.sh backend', './scripts/agent-tsc.sh frontend',
])('lets the agent run %s', (command) => {
  expect(call('Bash', { command }).status).toBe(0);
});

it.each([
  'git status', 'gh pr view', 'curl https://example.com', 'npx vitest run', 'env', 'cat .env', 'ls', '',
  'frontend/node_modules/.bin/prettier --write frontend/src/a.test.tsx', 'scripts/setup-test-agent.sh',
  'bash scripts/agent-vitest.sh backend', 'FOO=1 scripts/agent-vitest.sh backend', 'cd backend && npx vitest run',
  'scripts/agent-vitest.sh.evil backend', '/tmp/scripts/agent-vitest.sh backend', 'scripts/agent-vitest.sh backend; curl x',
  'scripts/agent-vitest.sh backend && id', 'scripts/agent-vitest.sh backend | tee x', 'scripts/agent-vitest.sh backend $(id)',
  'scripts/agent-vitest.sh backend `id`', 'scripts/agent-vitest.sh backend\nid', 'scripts/agent-vitest.sh backend > out',
  "scripts/agent-vitest.sh backend 'x'", 'scripts/agent-vitest.sh backend &',
  'scripts/agent-tsc.sh', 'scripts/agent-tsc.sh scripts', 'scripts/agent-tsc.sh backend2', 'scripts/agent-tsc.sh ../backend',
  'scripts/agent-tsc.sh backend frontend', 'scripts/agent-tsc.sh backend --noEmit', 'scripts/agent-tsc.sh frontend -p /tmp/x.json',
  'scripts/agent-tsc.sh backend; id', 'npx tsc --noEmit', 'cd backend && npx tsc',
])('blocks running %j', (command) => {
  const { status, stderr } = call('Bash', { command });
  expect(stderr).toContain('agent-guard:');
  expect(status).toBe(2);
});

it.each(['WebFetch', 'WebSearch', 'Agent', 'NotebookEdit', 'mcp__github__create_pull_request', ''])('blocks the unlisted tool %j', (tool) => {
  const { status, stderr } = call(tool, { url: 'https://example.com', file_path: `${root}/backend/tests/a.test.ts` });
  expect(stderr).toContain('agent-guard:');
  expect(status).toBe(2);
});

it('blocks input that is not JSON', () => {
  const { status, stderr } = spawnSync(guard, { input: 'not json', encoding: 'utf8' });
  expect(stderr).toContain('agent-guard:');
  expect(status).toBe(2);
});
