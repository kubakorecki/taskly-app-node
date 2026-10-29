import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, expect, it } from 'vitest';

// scripts/agent-prettier.sh is how the test agent formats test files, so a Prettier plugin or config from a PR must not see its tokens.
const wrapper = fileURLToPath(new URL('../../scripts/agent-prettier.sh', import.meta.url));
const root = fileURLToPath(new URL('../..', import.meta.url)).replace(/\/$/, '');
// Not a .test.ts name, so a probe left behind by a crash never runs as a test.
const probe = `frontend/src/test/agent-prettier-probe-${randomUUID()}.ts`;
const run = (args: string[]) => spawnSync(wrapper, args, { cwd: root, encoding: 'utf8', timeout: 30_000 });

afterAll(() => rmSync(`${root}/${probe}`, { force: true }));

// CI installs one package per job, so the backend job has no frontend Prettier to run.
it.skipIf(!existsSync(`${root}/frontend/node_modules/.bin/prettier`))('formats frontend test files in place', () => {
  writeFileSync(`${root}/${probe}`, 'const a = {b:1}\n');
  expect(run([probe]).status).toBe(0);
  expect(readFileSync(`${root}/${probe}`, 'utf8')).toBe('const a = { b: 1 }\n');
});

it.each([
  [], ['frontend/src/App.tsx'], ['frontend/src/features/todos/utils.ts'], ['backend/tests/router.test.ts'],
  ['frontend/src/a.test.tsx', 'frontend/src/App.tsx'], ['frontend/src/../../backend/src/a.test.ts'], ['frontend/src/test/../App.tsx'],
  ['src/a.test.tsx'], ['./frontend/src/a.test.tsx'], ['/tmp/frontend/src/a.test.tsx'], ['--write'], ['--plugin=x'],
  ['--config=/tmp/x', 'frontend/src/a.test.tsx'], ['frontend/src/a.test.tsx;id'], ['frontend/src/$(id).test.tsx'],
  ['frontend/src/a b.test.tsx'], ['frontend/src/a.test.tsx\nid'], ['frontend/node_modules/x/a.test.ts'],
])('rejects args %j', (...args) => {
  const { status, stderr } = run(args);
  expect(stderr).toContain('agent-prettier:');
  expect(status).toBe(2);
});
