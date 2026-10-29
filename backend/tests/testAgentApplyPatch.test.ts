import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, expect, it } from 'vitest';

// scripts/test-agent-apply-patch.sh applies the test agent's patch and rejects anything that isn't a test or fixture file.
const script = fileURLToPath(new URL('../../scripts/test-agent-apply-patch.sh', import.meta.url));
let repo: string;

const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
const write = (files: Record<string, string>) => Object.entries(files).forEach(([file, content]) => {
  mkdirSync(dirname(`${repo}/${file}`), { recursive: true });
  writeFileSync(`${repo}/${file}`, content);
});
// Builds the patch the way the generate job does (git diff --binary against the snapshot tree), then resets.
const patchOf = (change: () => void) => {
  const tree = git('write-tree');
  change();
  git('add', '-A');
  const patch = execFileSync('git', ['diff', '--cached', '--binary', tree], { cwd: repo, encoding: 'utf8' });
  git('reset', '-q', '--hard', 'HEAD');
  git('clean', '-qfd');
  writeFileSync(`${repo}/../test-agent.patch`, patch);
  return `${repo}/../test-agent.patch`;
};
const run = (...args: string[]) => spawnSync(script, args, { cwd: repo, encoding: 'utf8', timeout: 30_000 });
const staged = () => git('diff', '--cached', '--name-only').split('\n').filter(Boolean);

beforeEach(() => {
  repo = `${realpathSync(mkdtempSync(`${tmpdir()}/test-agent-apply-patch-`))}/repo`;
  mkdirSync(repo);
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'Test');
  git('config', 'commit.gpgsign', 'false');
  write({
    'backend/src/factory.ts': 'export const a = 1;\n', 'backend/tests/router.test.ts': 'old\n',
    'frontend/src/test/setup.ts': 'setup\n', 'frontend/src/App.test.tsx': 'old\n', 'frontend/vite.config.ts': '{}\n',
  });
  git('add', '-A');
  git('commit', '-q', '-m', 'base');
});
afterEach(() => rmSync(dirname(repo), { recursive: true, force: true }));

it('stages a patch of test and fixture files and lists them', () => {
  const patch = patchOf(() => write({
    'backend/tests/router.test.ts': 'new\n', 'backend/tests/new/nested.test.ts': 'n\n', 'backend/tests/fixture.ts': 'f\n',
    'frontend/src/App.test.tsx': 'new\n', 'frontend/src/features/todos/utils/status.test.ts': 's\n',
    'frontend/src/test/todoFixture.ts': 'f\n', 'frontend/src/test/fixture.png': '\u0000\u0001binary',
  }));

  const { status, stdout, stderr } = run(patch);

  expect(status, stderr).toBe(0);
  const files = [
    'backend/tests/fixture.ts', 'backend/tests/new/nested.test.ts', 'backend/tests/router.test.ts', 'frontend/src/App.test.tsx',
    'frontend/src/features/todos/utils/status.test.ts', 'frontend/src/test/fixture.png', 'frontend/src/test/todoFixture.ts',
  ];
  expect(JSON.parse(stdout)).toEqual({ files, violations: [] });
  expect(staged()).toEqual(files);
});

it('rejects files outside the test paths, the Vitest setup file, deletions and non-regular files', () => {
  const patch = patchOf(() => {
    write({
      'backend/src/factory.ts': 'export const a = 2;\n', 'backend/src/factory.test.ts': 'x\n', 'frontend/vite.config.ts': '{ }\n',
      'frontend/src/test/setup.ts': 'changed\n', 'frontend/src/App.test.js': 'x\n', 'scripts/agent-guard.sh': 'exit 0\n',
      'backend/tests/ok.test.ts': 'ok\n', 'backend/tests/run.sh': 'x\n',
    });
    rmSync(`${repo}/frontend/src/App.test.tsx`);
    chmodSync(`${repo}/backend/tests/run.sh`, 0o755);
    symlinkSync('../src/factory.ts', `${repo}/backend/tests/link.test.ts`);
  });

  const { status, stdout } = run(patch);

  expect(JSON.parse(stdout)).toEqual({
    files: [
      'backend/src/factory.test.ts', 'backend/src/factory.ts', 'backend/tests/link.test.ts', 'backend/tests/ok.test.ts',
      'backend/tests/run.sh', 'frontend/src/App.test.js', 'frontend/src/App.test.tsx', 'frontend/src/test/setup.ts',
      'frontend/vite.config.ts', 'scripts/agent-guard.sh',
    ],
    violations: [
      { path: 'backend/src/factory.test.ts', reason: 'outside the test paths' },
      { path: 'backend/src/factory.ts', reason: 'outside the test paths' },
      { path: 'backend/tests/link.test.ts', reason: 'not a regular file' },
      { path: 'backend/tests/run.sh', reason: 'not a regular file' },
      { path: 'frontend/src/App.test.js', reason: 'outside the test paths' },
      { path: 'frontend/src/App.test.tsx', reason: 'deleted' },
      { path: 'frontend/src/test/setup.ts', reason: 'the Vitest setup file' },
      { path: 'frontend/vite.config.ts', reason: 'outside the test paths' },
      { path: 'scripts/agent-guard.sh', reason: 'outside the test paths' },
    ],
  });
  expect(status).toBe(1);
});

it('accepts an empty patch', () => {
  const patch = patchOf(() => {});

  const { status, stdout } = run(patch);

  expect(JSON.parse(stdout)).toEqual({ files: [], violations: [] });
  expect(status).toBe(0);
});

it('exits 3 and stages nothing when the patch does not apply', () => {
  const patch = patchOf(() => write({ 'backend/tests/router.test.ts': 'new\n' }));
  write({ 'backend/tests/router.test.ts': 'moved on\n' });
  git('commit', '-qam', 'head moved');

  const { status, stdout, stderr } = run(patch);

  expect(stdout).toBe('');
  expect(stderr).toContain('test-agent-apply-patch: the patch does not apply');
  expect(status).toBe(3);
  expect(staged()).toEqual([]);
});

it.each([[[]], [['a.patch', 'b.patch']], [['no-such.patch']]])('rejects args %j', (args) => {
  const { status, stderr } = run(...args);
  expect(stderr).toContain('test-agent-apply-patch:');
  expect(status).toBe(2);
});
