import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, expect, it } from 'vitest';

// scripts/test-agent-results.sh turns the verify job's raw Vitest, typecheck and format output into test-agent-results.json.
const script = fileURLToPath(new URL('../test-agent-results.sh', import.meta.url));
let repo: string;
let out: string;

const write = (files: Record<string, unknown>) => Object.entries(files).forEach(([file, content]) => {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content));
});
// vitest list --json: one entry per test, keyed by absolute file path.
const list = (counts: Record<string, number>) => Object.entries(counts)
  .flatMap(([file, count]) => Array.from({ length: count }, (_, i) => ({ name: `test ${i}`, file: `${repo}/${file}` })));
const vitestJson = (passed: number, failed = 0, pending = 0) => ({
  success: failed === 0, numPassedTests: passed, numFailedTests: failed, numPendingTests: pending, numTodoTests: 0,
  numTotalTests: passed + failed + pending, testResults: [],
});
const check = (id: string, exit: number, log = '') => write({ [`${out}/checks/${id}.exit`]: `${exit}\n`, [`${out}/checks/${id}.log`]: log });
const metrics = (pct: number) => ({ total: 10, covered: pct / 10, skipped: 0, pct });
const summary = (pkg: string, files: Record<string, number>) => write({
  [`${repo}/${pkg}/coverage/coverage-summary.json`]: Object.fromEntries([
    ['total', { statements: metrics(50), branches: metrics(50), functions: metrics(50), lines: metrics(50) }],
    ...Object.entries(files).map(([file, pct]) => [`${repo}/${file}`, {
      statements: metrics(pct), branches: metrics(100), functions: metrics(100), lines: metrics(pct),
    }]),
  ]),
});
const results = () => {
  const { status, stdout, stderr } = spawnSync(script, [out], { cwd: `${repo}/backend`, encoding: 'utf8', timeout: 30_000 });
  expect(status, stderr).toBe(0);
  return JSON.parse(stdout);
};

beforeEach(() => {
  const tmp = realpathSync(mkdtempSync(`${tmpdir()}/test-agent-results-`));
  repo = `${tmp}/repo`;
  out = `${tmp}/out`;
  mkdirSync(`${repo}/backend`, { recursive: true });
  mkdirSync(out);
  execFileSync('git', ['init', '-q', repo]);
});
afterEach(() => rmSync(dirname(repo), { recursive: true, force: true }));

it('collects test counts, check results and coverage from a green run', () => {
  write({
    [`${out}/backend-list-before.json`]: list({ 'backend/tests/router.test.ts': 3 }),
    [`${out}/backend-list-after.json`]: list({ 'backend/tests/router.test.ts': 5, 'backend/tests/new.test.ts': 2 }),
    [`${out}/frontend-list-before.json`]: list({ 'frontend/src/App.test.tsx': 1 }),
    [`${out}/frontend-list-after.json`]: list({ 'frontend/src/App.test.tsx': 1 }),
    [`${out}/backend-vitest.json`]: vitestJson(7),
    [`${out}/frontend-vitest.json`]: vitestJson(1, 0, 2),
  });
  ['backend-typecheck', 'backend-tests', 'frontend-typecheck', 'frontend-format', 'frontend-tests'].forEach((id) => check(id, 0, 'all good\n'));
  summary('backend', { 'backend/src/router.ts': 100, 'backend/src/factory.ts': 92.31 });
  summary('frontend', { 'frontend/src/App.tsx': 80 });

  expect(results()).toEqual({
    version: 1,
    testCounts: { status: 'ok', before: 4, after: 8, decreased: [] },
    checks: [
      { name: 'backend typecheck', ok: true, summary: 'passed', log: null },
      { name: 'backend tests', ok: true, summary: '7 passed', log: null },
      { name: 'frontend typecheck', ok: true, summary: 'passed', log: null },
      { name: 'frontend format', ok: true, summary: 'passed', log: null },
      { name: 'frontend tests', ok: true, summary: '1 passed, 2 skipped', log: null },
    ],
    coverage: {
      'backend/src/router.ts': { statements: 100, branches: 100, functions: 100, lines: 100 },
      'backend/src/factory.ts': { statements: 92.31, branches: 100, functions: 100, lines: 92.31 },
      'frontend/src/App.tsx': { statements: 80, branches: 100, functions: 100, lines: 80 },
    },
  });
});

it('lists every test file that lost tests', () => {
  write({
    [`${out}/backend-list-before.json`]: list({ 'backend/tests/a.test.ts': 3, 'backend/tests/b.test.ts': 2, 'backend/tests/c.test.ts': 1 }),
    [`${out}/backend-list-after.json`]: list({ 'backend/tests/a.test.ts': 6, 'backend/tests/b.test.ts': 1 }),
  });

  expect(results().testCounts).toEqual({
    status: 'decreased', before: 6, after: 7,
    decreased: [{ file: 'backend/tests/b.test.ts', before: 2, after: 1 }, { file: 'backend/tests/c.test.ts', before: 1, after: 0 }],
  });
});

it.each([
  ['the patched tests fail to load', { [`backend-list-before.json`]: list({ 'backend/tests/a.test.ts': 1 }) }],
  ['the head tests fail to load', { [`backend-list-after.json`]: list({ 'backend/tests/a.test.ts': 1 }) }],
  ['a list is not JSON', { [`backend-list-before.json`]: '[', [`backend-list-after.json`]: '[]' }],
  ['nothing was listed', {}],
])('cannot count tests when %s', (_, files) => {
  write(Object.fromEntries(Object.entries(files).map(([file, content]) => [`${out}/${file}`, content])));

  expect(results()).toMatchObject({ testCounts: { status: 'unknown', before: null, after: null, decreased: [] }, coverage: {} });
});

it('fails every check that did not run', () => {
  check('backend-typecheck', 0);

  expect(results().checks).toEqual([
    { name: 'backend typecheck', ok: true, summary: 'passed', log: null },
    ...['backend tests', 'frontend typecheck', 'frontend format', 'frontend tests'].map((name) => ({ name, ok: false, summary: 'did not run', log: null })),
  ]);
});

it('reports failed checks with the end of their log', () => {
  const longLog = `${Array.from({ length: 80 }, (_, i) => `line ${i}`).join('\n')}\n`;
  write({ [`${out}/backend-vitest.json`]: vitestJson(5, 2), [`${out}/frontend-vitest.json`]: vitestJson(4) });
  check('backend-typecheck', 2, 'src/a.ts(1,1): error TS2322\n');
  check('backend-tests', 1, '\u001b[31mFAIL\u001b[39m tests/a.test.ts\n');
  check('frontend-format', 1, longLog);
  check('frontend-tests', 1, 'ERROR: Coverage for lines (90%) does not meet the threshold\n');

  const { checks } = results();

  expect(checks).toEqual([
    { name: 'backend typecheck', ok: false, summary: 'failed', log: 'src/a.ts(1,1): error TS2322\n' },
    { name: 'backend tests', ok: false, summary: '5 passed, 2 failed', log: 'FAIL tests/a.test.ts\n' },
    { name: 'frontend typecheck', ok: false, summary: 'did not run', log: null },
    { name: 'frontend format', ok: false, summary: 'failed', log: expect.any(String) },
    { name: 'frontend tests', ok: true, summary: '4 passed, coverage below the thresholds', log: 'ERROR: Coverage for lines (90%) does not meet the threshold\n' },
  ]);
  expect(checks[3].log).toBe(`${Array.from({ length: 50 }, (_, i) => `line ${i + 30}`).join('\n')}\n`);
});

it('fails a test check whose Vitest run left no results', () => {
  check('frontend-tests', 1, 'Error: Cannot find module vitest\n');

  expect(results().checks.at(-1)).toEqual(
    { name: 'frontend tests', ok: false, summary: 'no results', log: 'Error: Cannot find module vitest\n' },
  );
});

it('keeps at most 3000 characters of a log', () => {
  check('backend-typecheck', 2, `${'x'.repeat(5000)}\n`);

  expect(results().checks[0].log).toBe(`${'x'.repeat(2999)}\n`);
});

it.each([[[]], [['a', 'b']], [['/no/such/dir']]])('rejects args %j', (args) => {
  const { status, stderr } = spawnSync(script, args, { cwd: repo, encoding: 'utf8', timeout: 30_000 });
  expect(stderr).toContain('test-agent-results:');
  expect(status).toBe(2);
});
