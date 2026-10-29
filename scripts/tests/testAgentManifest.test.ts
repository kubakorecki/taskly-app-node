import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, expect, it } from 'vitest';

// scripts/test-agent-manifest.sh writes the change manifest the test agent starts from (.claude/skills/analyze-pr-changes).
const script = fileURLToPath(new URL('../test-agent-manifest.sh', import.meta.url));
let repo: string;

const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
const write = (files: Record<string, string>) => Object.entries(files).forEach(([file, content]) => {
  mkdirSync(dirname(`${repo}/${file}`), { recursive: true });
  writeFileSync(`${repo}/${file}`, content);
});
const commit = (message: string) => {
  git('add', '-A');
  git('commit', '-q', '--allow-empty', '-m', message);
  return git('rev-parse', 'HEAD');
};
const metrics = (pct: number) => ({ total: 10, covered: pct / 10, skipped: 0, pct });
// Vitest keys coverage-summary.json by absolute path.
const summary = (pkg: string, files: Record<string, Partial<Record<'statements' | 'branches' | 'functions' | 'lines', number>>>) =>
  write({ [`${pkg}/coverage/coverage-summary.json`]: JSON.stringify(Object.fromEntries([
    ['total', { statements: metrics(50), branches: metrics(50), functions: metrics(50), lines: metrics(50) }],
    ...Object.entries(files).map(([file, pct]) => [`${repo}/${file}`, {
      statements: metrics(pct.statements ?? 100), branches: metrics(pct.branches ?? 100),
      functions: metrics(pct.functions ?? 100), lines: metrics(pct.lines ?? 100),
    }]),
  ])) });
const run = (args: string[]) => spawnSync(script, args, { cwd: repo, encoding: 'utf8', timeout: 30_000 });
const manifest = (...args: string[]) => {
  const { status, stdout, stderr } = run(args);
  expect(status, stderr).toBe(0);
  return JSON.parse(stdout);
};
const sourceFiles = (count: number, prefix: string) =>
  Object.fromEntries(Array.from({ length: count }, (_, i) => [`${prefix}${String(i).padStart(2, '0')}.ts`, `export const n = ${i};\n`]));
const full = { statements: 100, branches: 100, functions: 100, lines: 100 };

beforeEach(() => {
  repo = realpathSync(mkdtempSync(`${tmpdir()}/test-agent-manifest-`));
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'Test');
  git('config', 'commit.gpgsign', 'false');
});
afterEach(() => rmSync(repo, { recursive: true, force: true }));

it('classifies every file changed between the merge base and head, with its patch', () => {
  const longFile = `${Array.from({ length: 40 }, (_, i) => `export const line${i} = ${i};`).join('\n')}\n`;
  write({
    'backend/src/features/todos/router.ts': 'export const status = 200;\n',
    'backend/src/old.ts': longFile,
    'backend/src/gone.ts': 'export const gone = true;\n',
    'backend/tests/router.test.ts': 'old\n',
    'frontend/package.json': '{}\n',
    'README.md': '# Taskly\n',
  });
  const base = commit('base');
  git('checkout', '-qb', 'pr');
  rmSync(`${repo}/backend/src/gone.ts`);
  git('mv', 'backend/src/old.ts', 'backend/src/renamed.ts');
  write({
    'backend/src/features/todos/router.ts': 'export const status = 201;\n',
    'backend/src/renamed.ts': longFile.replace('line0 = 0', 'line0 = 100'),
    'backend/tests/router.test.ts': 'new\n',
    'backend/tests/fixture.ts': 'fixture\n',
    'frontend/src/features/todos/utils/status.ts': 'export const status = "open";\n',
    'frontend/src/features/todos/components/StatusBadge.tsx': 'export const StatusBadge = () => null;\n',
    'frontend/src/features/todos/utils/status.test.ts': 'test\n',
    'frontend/src/test/todoFixture.ts': 'fixture\n',
    'frontend/src/styles.css': 'body {}\n',
    'frontend/package.json': '{ "name": "frontend" }\n',
    'frontend/vite.config.ts': 'export default {};\n',
    '.github/workflows/ci.yml': 'name: ci\n',
    'README.md': '# Taskly\n\nTasks.\n',
    'docs/notes with space.md': 'notes\n',
  });
  const head = commit('pr');
  git('checkout', '-q', 'main');
  write({ 'backend/src/main-only.ts': 'export const later = 1;\n' });
  const mainHead = commit('main moves on');

  const result = manifest('pr', 'main', head);

  expect(result).toMatchObject({ mode: 'pr', base: mainHead, head, overflow: [] });
  expect(result.base).not.toBe(base);
  expect(result.files.map(({ path, kind, change, previousPath }: Record<string, string>) => ({ path, kind, change, previousPath }))).toEqual([
    { path: '.github/workflows/ci.yml', kind: 'config', change: 'added', previousPath: undefined },
    { path: 'README.md', kind: 'other', change: 'modified', previousPath: undefined },
    { path: 'backend/src/features/todos/router.ts', kind: 'backend', change: 'modified', previousPath: undefined },
    { path: 'backend/src/gone.ts', kind: 'backend', change: 'deleted', previousPath: undefined },
    { path: 'backend/src/renamed.ts', kind: 'backend', change: 'renamed', previousPath: 'backend/src/old.ts' },
    { path: 'backend/tests/fixture.ts', kind: 'test', change: 'added', previousPath: undefined },
    { path: 'backend/tests/router.test.ts', kind: 'test', change: 'modified', previousPath: undefined },
    { path: 'docs/notes with space.md', kind: 'other', change: 'added', previousPath: undefined },
    { path: 'frontend/package.json', kind: 'config', change: 'modified', previousPath: undefined },
    { path: 'frontend/src/features/todos/components/StatusBadge.tsx', kind: 'frontend', change: 'added', previousPath: undefined },
    { path: 'frontend/src/features/todos/utils/status.test.ts', kind: 'test', change: 'added', previousPath: undefined },
    { path: 'frontend/src/features/todos/utils/status.ts', kind: 'frontend', change: 'added', previousPath: undefined },
    { path: 'frontend/src/styles.css', kind: 'other', change: 'added', previousPath: undefined },
    { path: 'frontend/src/test/todoFixture.ts', kind: 'test', change: 'added', previousPath: undefined },
    { path: 'frontend/vite.config.ts', kind: 'config', change: 'added', previousPath: undefined },
  ]);
  const patchOf = (file: string) => result.files.find(({ path }: { path: string }) => path === file).patch;
  expect(patchOf('backend/src/features/todos/router.ts')).toBe('@@ -1 +1 @@\n-export const status = 200;\n+export const status = 201;\n');
  expect(patchOf('backend/src/renamed.ts')).toContain('+export const line0 = 100;');
  expect(patchOf('backend/src/gone.ts')).toContain('-export const gone = true;');
});

it('records the coverage baseline of source files from the coverage summaries', () => {
  write({ 'backend/src/kept.ts': 'a\n', 'backend/src/gone.ts': 'a\n', 'backend/tests/kept.test.ts': 'a\n' });
  commit('base');
  git('checkout', '-qb', 'pr');
  rmSync(`${repo}/backend/src/gone.ts`);
  write({
    'backend/src/kept.ts': 'b\n', 'backend/src/features/todos/types.ts': 'b\n', 'backend/tests/kept.test.ts': 'b\n',
    'frontend/src/App.tsx': 'b\n',
  });
  const head = commit('pr');
  summary('backend', { 'backend/src/kept.ts': { branches: 80, lines: 92.31 }, 'backend/src/gone.ts': {}, 'backend/tests/kept.test.ts': {} });

  const coverage = Object.fromEntries(manifest('pr', 'main', head).files.map(({ path, coverage }: { path: string; coverage: unknown }) => [path, coverage]));

  expect(coverage).toEqual({
    'backend/src/kept.ts': { statements: 100, branches: 80, functions: 100, lines: 92.31 },
    'backend/src/features/todos/types.ts': null,
    'backend/src/gone.ts': null,
    'backend/tests/kept.test.ts': null,
    'frontend/src/App.tsx': null,
  });
});

it('caps the run at 25 changed source files and lists the rest as overflow', () => {
  write({ 'backend/src/gone.ts': 'a\n' });
  commit('base');
  git('checkout', '-qb', 'pr');
  rmSync(`${repo}/backend/src/gone.ts`);
  write({ ...sourceFiles(20, 'backend/src/b'), ...sourceFiles(7, 'frontend/src/f'), ...sourceFiles(3, 'backend/tests/t') });
  const head = commit('pr');

  const result = manifest('pr', 'main', head);

  expect(result.overflow).toEqual(['frontend/src/f05.ts', 'frontend/src/f06.ts']);
  expect(result.files.filter(({ kind }: { kind: string }) => kind !== 'test').map(({ path }: { path: string }) => path)).toEqual([
    ...Object.keys(sourceFiles(20, 'backend/src/b')), 'backend/src/gone.ts', ...Object.keys(sourceFiles(5, 'frontend/src/f')),
  ]);
  expect(result.files.filter(({ kind }: { kind: string }) => kind === 'test')).toHaveLength(3);
});

it('truncates a patch longer than 64 KiB', () => {
  write({ 'docs/big.md': 'a\n' });
  commit('base');
  write({ 'docs/big.md': `${'x'.repeat(100)}\n`.repeat(1000) });
  const head = commit('big');

  const { patch } = manifest('pr', 'HEAD~1', head).files[0];

  expect(patch).toHaveLength(65_536 + '\n[patch truncated at 65536 characters]'.length);
  expect(patch).toMatch(/^@@ -1 \+1,1000 @@\n-a\n\+x{100}\n/);
  expect(patch).toMatch(/\n\[patch truncated at 65536 characters\]$/);
});

it('lists every source file in the backfill scope below 100%', () => {
  write({ 'README.md': 'a\n' });
  const head = commit('base');
  summary('backend', {
    'backend/src/full.ts': full, 'backend/src/lines.ts': { lines: 50 }, 'backend/src/branches.ts': { branches: 99.5 },
    ...Object.fromEntries(Object.keys(sourceFiles(25, 'backend/src/zero')).map((file) => [file, { statements: 0, branches: 0, functions: 0, lines: 0 }])),
  });
  summary('frontend', { 'frontend/src/App.tsx': { lines: 10 } });

  const result = manifest('backfill', 'backend');

  expect(result).toMatchObject({ mode: 'backfill', scope: 'backend', base: null, head });
  expect(result.files[0]).toEqual({
    path: 'backend/src/branches.ts', kind: 'backend', change: 'unchanged', patch: null, coverage: { ...full, branches: 99.5 },
  });
  expect(result.files.map(({ path }: { path: string }) => path)).toEqual(
    ['backend/src/branches.ts', 'backend/src/lines.ts', ...Object.keys(sourceFiles(23, 'backend/src/zero'))]);
  expect(result.overflow).toEqual(['backend/src/zero23.ts', 'backend/src/zero24.ts']);
});

it('fails a backfill run without a coverage summary', () => {
  commit('base');
  const { status, stderr } = run(['backfill', 'frontend']);
  expect(stderr).toContain('test-agent-manifest: no coverage summary');
  expect(status).toBe(1);
});

it.each([[], ['pr'], ['pr', 'main'], ['pr', 'main', 'HEAD', 'x'], ['backfill'], ['backfill', 'docs'], ['backfill', 'backend', 'x'], ['diff', 'main', 'HEAD']])(
  'rejects args %j',
  (...args) => {
    const { status, stderr } = run(args);
    expect(stderr).toContain('test-agent-manifest:');
    expect(status).toBe(2);
  },
);

it('fails on an unknown revision', () => {
  write({ 'README.md': 'a\n' });
  commit('base');
  const { status, stderr } = run(['pr', 'no-such-branch', 'HEAD']);
  expect(stderr).toContain('test-agent-manifest: unknown revision: no-such-branch');
  expect(status).toBe(1);
});
