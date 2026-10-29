import { spawnSync } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, expect, it } from 'vitest';

// scripts/test-agent-render.sh decides the test-agent check and the commit, and renders the sticky PR comment.
const script = fileURLToPath(new URL('../../scripts/test-agent-render.sh', import.meta.url));
let dir: string;

const full = { statements: 100, branches: 100, functions: 100, lines: 100 };
const manifest = {
  mode: 'pr', base: 'a'.repeat(40), head: 'b'.repeat(40), overflow: ['frontend/src/z.ts'],
  files: [
    { path: 'backend/src/router.ts', kind: 'backend', change: 'modified', coverage: { ...full, branches: 75 } },
    { path: 'backend/src/types.ts', kind: 'backend', change: 'added', coverage: null },
    { path: 'backend/src/gone.ts', kind: 'backend', change: 'deleted', coverage: null },
    { path: 'backend/tests/router.test.ts', kind: 'test', change: 'modified', coverage: null },
    { path: 'frontend/src/App.tsx', kind: 'frontend', change: 'modified', coverage: full },
  ],
};
const report = {
  version: 1, mode: 'pr', finished: true, summary: 'Tested the router.',
  decisions: [
    { sourceFile: 'backend/src/router.ts', decision: 'update', reason: 'New status route.', testFile: 'backend/tests/router.test.ts' },
    { sourceFile: 'backend/src/types.ts', decision: 'skip', reason: 'Types only.', testFile: null },
  ],
  intentionalChanges: [{ id: 'status-replaces-completed', description: 'Status replaces completed.', files: [], evidence: 'diff' }],
  tests: [{ testFile: 'backend/tests/router.test.ts', newFile: false, added: ['returns 201'], updated: ['lists tasks'] }],
  editedAssertions: [{
    testFile: 'backend/tests/router.test.ts', test: 'lists tasks', before: 'expect(t.completed).toBe(false)',
    after: "expect(t.status).toBe('open')", intentionalChange: 'status-replaces-completed', reason: 'The field was renamed.',
  }],
  checklistExemptions: [], suspectedBugs: [], flaky: [], agentObservedCoverage: [],
};
const patchCheck = { files: ['backend/tests/router.test.ts'], violations: [] };
const passed = (name: string) => ({ name, ok: true, summary: 'passed', log: null });
const results = {
  version: 1,
  testCounts: { status: 'ok', before: 10, after: 11, decreased: [] },
  checks: [passed('backend typecheck'), { ...passed('backend tests'), summary: '11 passed' }, passed('frontend format')],
  coverage: { 'backend/src/router.ts': full, 'frontend/src/App.tsx': { ...full, lines: 90 } },
};
const suspectedBug = {
  sourceFile: 'backend/src/router.ts', testFile: 'backend/tests/router.test.ts', test: 'rejects a huge id', existing: false,
  explanation: 'Accepts ids above MAX_SAFE_INTEGER.', code: "it('rejects a huge id', () => {})", output: 'AssertionError: expected 200 to be 400',
};

const write = (files: Record<string, unknown>) =>
  Object.entries(files).forEach(([file, content]) => writeFileSync(`${dir}/${file}`, typeof content === 'string' ? content : JSON.stringify(content)));
const inputs = (overrides: Record<string, unknown> = {}) => write(Object.fromEntries(Object.entries({
  'test-agent-manifest.json': manifest, 'test-agent-report.json': report, 'patch-check.json': patchCheck,
  'test-agent-results.json': results, ...overrides,
}).filter(([, content]) => content !== undefined)));
const render = (env: Record<string, string> = {}) => {
  const { status, stdout, stderr } = spawnSync(script, [dir], {
    encoding: 'utf8', timeout: 30_000,
    env: {
      PATH: process.env.PATH, RUN_URL: 'https://github.com/o/r/actions/runs/1', TRANSCRIPT_URL: 'https://github.com/o/r/actions/runs/1/artifacts/2',
      REPO_URL: 'https://github.com/o/r', ...env,
    },
  });
  expect(status, stderr).toBe(0);
  return JSON.parse(stdout);
};

beforeEach(() => {
  dir = realpathSync(mkdtempSync(`${tmpdir()}/test-agent-render-`));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

it('renders a green run as the sticky comment', () => {
  inputs();

  const { conclusion, commit, title, body } = render({ PUSH: 'c'.repeat(40) });

  expect({ conclusion, commit, title }).toEqual({ conclusion: 'success', commit: true, title: '1 test added, all checks passed' });
  expect(body).toMatch(/^<!-- test-agent -->\n### Test agent: ✅ 1 test added, all checks passed\n\nTested the router\.\n/);
  expect(body).toContain([
    '| Source file | Decision | Test file | Reason |', '| --- | --- | --- | --- |',
    '| `backend/src/router.ts` | update | `backend/tests/router.test.ts` | New status route. |',
    '| `backend/src/types.ts` | skip |  | Types only. |',
    '| `frontend/src/App.tsx` | none |  | The run stopped before deciding. |',
  ].join('\n'));
  expect(body).toContain('Over the 25-file cap, so not tested in this run: `frontend/src/z.ts`');
  expect(body).toContain('- `backend/tests/router.test.ts`\n  - Added: returns 201\n  - Updated: lists tasks');
  expect(body).toContain([
    '- `backend/tests/router.test.ts`: lists tasks. Status replaces completed. The field was renamed.', '',
    '  ```diff', '  - expect(t.completed).toBe(false)', "  + expect(t.status).toBe('open')", '  ```',
  ].join('\n'));
  expect(body).toContain([
    '| Check | Result |', '| --- | --- |', '| Backend typecheck | ✅ passed |', '| Backend tests | ✅ 11 passed |',
    '| Frontend format | ✅ passed |', '| Test count | ✅ 10 before, 11 after |',
  ].join('\n'));
  expect(body).toContain([
    '| File | Before | After |', '| --- | --- | --- |',
    '| `backend/src/router.ts` | 100 / 75 / 100 / 100 | ✅ 100 / 100 / 100 / 100 |',
    '| `backend/src/types.ts` | not measured | not measured |',
    '| `frontend/src/App.tsx` | ✅ 100 / 100 / 100 / 100 | 100 / 100 / 100 / 90 |',
  ].join('\n'));
  expect(body).not.toContain('Suspected bugs');
  expect(body).not.toContain('[!WARNING]');
  expect(body).toMatch(/\[Workflow run\]\(https:\/\/github\.com\/o\/r\/actions\/runs\/1\) · \[Agent transcript\]\(https:\/\/github\.com\/o\/r\/actions\/runs\/1\/artifacts\/2\) · Commit \[`c{7}`\]\(https:\/\/github\.com\/o\/r\/commit\/c{40}\)\n$/);
});

it.each([
  ['the output is missing', { 'test-agent-manifest.json': undefined }, {}, 'neutral', false, "The test agent's output is missing"],
  ['the manifest is not JSON', { 'test-agent-manifest.json': '{' }, {}, 'neutral', false, "The test agent's output is missing"],
  ['there is nothing to test', { 'test-agent-manifest.json': { ...manifest, overflow: [], files: [manifest.files[3]] }, 'test-agent-report.json': undefined,
    'patch-check.json': undefined, 'test-agent-results.json': undefined }, {}, 'success', false, 'No source files to test'],
  ['the report is missing', { 'test-agent-report.json': undefined }, {}, 'neutral', false, 'The test agent wrote no report'],
  ['the report is not a version 1 report', { 'test-agent-report.json': { version: 2 } }, {}, 'neutral', false, 'The test agent wrote no report'],
  ['the patch does not apply', { 'patch-check.json': undefined }, {}, 'neutral', false, 'The patch does not apply'],
  ['the patch leaves the test paths', { 'patch-check.json': { files: ['a.ts'], violations: [{ path: 'a.ts', reason: 'outside the test paths' }] } }, {},
    'failure', false, 'The patch changes files outside the test paths'],
  ['the verification did not finish', { 'test-agent-results.json': undefined }, {}, 'neutral', false, 'The verification did not finish'],
  ['tests were removed', { 'test-agent-results.json': { ...results, testCounts: { status: 'decreased', before: 3, after: 2, decreased: [] } } }, {},
    'failure', false, 'The patch removes tests'],
  ['tests cannot be counted', { 'test-agent-results.json': { ...results, testCounts: { status: 'unknown', before: null, after: null, decreased: [] } } }, {},
    'failure', false, 'The tests could not be counted'],
  ['checks fail', { 'test-agent-results.json': { ...results, checks: [{ ...passed('backend tests'), ok: false }, passed('x'), { ...passed('frontend format'), ok: false }] } },
    {}, 'failure', false, 'Backend tests and frontend format failed'],
  ['there is a Suspected bug', { 'test-agent-report.json': { ...report, suspectedBugs: [suspectedBug] } }, {}, 'failure', true, '1 Suspected bug'],
  ['there are Suspected bugs', { 'test-agent-report.json': { ...report, suspectedBugs: [suspectedBug, suspectedBug] } }, {}, 'failure', true, '2 Suspected bugs'],
  ['the push failed', {}, { PUSH: 'failed' }, 'neutral', true, 'The push failed'],
  ['the agent changed nothing', { 'patch-check.json': { files: [], violations: [] }, 'test-agent-results.json': { ...results, testCounts: { ...results.testCounts, after: 10 } } },
    {}, 'success', false, 'No test changes, all checks passed'],
  ['tests were added', { 'test-agent-results.json': { ...results, testCounts: { ...results.testCounts, after: 13 } } }, {}, 'success', true, '3 tests added, all checks passed'],
])('reports %s', (_, files, env, conclusion, commit, title) => {
  inputs(files);

  const rendered = render(env);

  expect({ conclusion: rendered.conclusion, commit: rendered.commit, title: rendered.title }).toEqual({ conclusion, commit, title });
  expect(rendered.body).toMatch(new RegExp(`^<!-- test-agent -->\\n### Test agent: (✅|❌|⚪) ${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\n`));
});

it('says why nothing was committed', () => {
  inputs({ 'test-agent-results.json': { ...results, checks: [{ ...passed('backend tests'), ok: false }] } });
  expect(render().body).toContain('· Not committed: backend tests failed\n');

  inputs({ 'patch-check.json': { files: [], violations: [] } });
  expect(render().body).toContain('· Not committed: the agent changed no tests\n');
});

it('shows path violations, removed tests and failed check output', () => {
  inputs({
    'patch-check.json': { files: ['backend/src/a.ts', 'backend/tests/a.test.ts'], violations: [{ path: 'backend/src/a.ts', reason: 'outside the test paths' }] },
    'test-agent-results.json': {
      ...results,
      testCounts: { status: 'decreased', before: 5, after: 4, decreased: [{ file: 'backend/tests/a.test.ts', before: 3, after: 2 }] },
      checks: [{ name: 'backend tests', ok: false, summary: '3 passed, 1 failed', log: 'FAIL a.test.ts\n```\n' }],
    },
  });

  const { body } = render();

  expect(body).toContain('The patch was rejected:\n\n- `backend/src/a.ts`: outside the test paths\n');
  expect(body).toContain('| Backend tests | ❌ 3 passed, 1 failed |');
  expect(body).toContain('| Test count | ❌ 5 before, 4 after |');
  expect(body).toContain('- `backend/tests/a.test.ts`: 3 tests before, 2 after');
  expect(body).toContain('<details><summary>Backend tests output</summary>\n\n````\nFAIL a.test.ts\n```\n````\n\n</details>');
});

it('reports Suspected bugs with their test code and failure output, and flaky tests', () => {
  inputs({
    'test-agent-report.json': {
      ...report, suspectedBugs: [suspectedBug, { ...suspectedBug, existing: true, test: 'lists tasks' }],
      flaky: [{ testFile: 'frontend/src/App.test.tsx', test: 'shows the list', output: 'timed out' }],
    },
  });

  const { body } = render();

  expect(body).toContain([
    '#### Suspected bugs', '',
    '- `backend/src/router.ts`: rejects a huge id (new test, not committed). Accepts ids above MAX\\_SAFE\\_INTEGER.', '',
    '  <details><summary>Test and failure output</summary>', '',
    '  ```ts', "  it('rejects a huge id', () => {})", '  ```', '',
    '  ```', '  AssertionError: expected 200 to be 400', '  ```', '',
    '  </details>', '',
    '- `backend/src/router.ts`: lists tasks (existing test in `backend/tests/router.test.ts`). Accepts ids above MAX\\_SAFE\\_INTEGER.',
  ].join('\n'));
  expect(body).toContain('#### Flaky tests, taken out\n\n- `frontend/src/App.test.tsx`: shows the list\n\n  <details><summary>Output</summary>\n\n  ```\n  timed out\n  ```\n\n  </details>');
});

it('escapes the text the agent wrote', () => {
  inputs({
    'test-agent-report.json': {
      ...report, summary: 'Ping @octocat <script>alert(1)</script> | **bold** [x](https://evil) $x$ #1\nsecond line',
      decisions: [{ ...report.decisions[0], sourceFile: 'backend/src/we`ird|.ts', reason: 'a | b' }],
      suspectedBugs: [{ ...suspectedBug, code: '```\n@octocat\n```' }],
    },
    'test-agent-manifest.json': { ...manifest, files: [{ ...manifest.files[0], path: 'backend/src/we`ird|.ts' }] },
  });

  const { body } = render();

  expect(body).toContain('Ping @⁠octocat &lt;script&gt;alert(1)&lt;/script&gt; \\| \\*\\*bold\\*\\* \\[x\\](https://evil) \\$x\\$ \\#1 second line');
  expect(body).toContain('| backend/src/we\\`ird\\|.ts | update | `backend/tests/router.test.ts` | a \\| b |');
  expect(body).toContain('  ````ts\n  ```\n  @octocat\n  ```\n  ````');
  // Only the one inside the code block can mention anyone, and GitHub doesn't link mentions there.
  expect(body.match(/@octocat/g)).toEqual(['@octocat']);
});

it.each([
  ['no result event', undefined, 'timed out or crashed'],
  ['the usage limit', { subtype: 'success', api_error: 'usage_limit_reached', api_error_status: 429, result: 'limit' }, 'Claude usage limit reached'],
  ['another API error', { subtype: 'success', api_error: 'overloaded_error\n::error::x', api_error_status: 529, result: 'busy' }, 'API error: overloaded_errorerrorx'],
  ['the turn limit', { subtype: 'error_max_turns', api_error: null, result: null }, 'turn limit reached'],
  ['an execution error', { subtype: 'error_during_execution', api_error: null, result: null }, 'error during the run'],
  ['a clean exit', { subtype: 'success', api_error: null, result: null }, 'ended without finishing its report'],
])('says the agent stopped early after %s', (_, agentResult, reason) => {
  inputs({
    'test-agent-report.json': { ...report, finished: false }, 'agent-result.json': agentResult,
    'test-agent-results.json': { ...results, checks: [{ ...passed('backend tests'), ok: false }] },
  });

  const { conclusion, title, body } = render({ AGENT: 'failure' });

  expect({ conclusion, title }).toEqual({ conclusion: 'failure', title: `The agent stopped early (${reason}): backend tests failed` });
  expect(body).toContain(`> [!WARNING]\n> The test agent stopped before it finished (${reason}), so this report is partial.`);
});

it("quotes Claude Code's message when the API ended the run", () => {
  inputs({ 'agent-result.json': { subtype: 'success', api_error: 'usage_limit_reached', api_error_status: 429, result: "You've hit your limit · resets 1:10pm *now*" } });
  expect(render({ AGENT: 'failure' }).body).toContain("so this report is partial.\n>\n> Claude Code: You've hit your limit · resets 1:10pm \\*now\\*\n");
});

it('warns when the agent stopped early', () => {
  inputs({ 'test-agent-report.json': { ...report, finished: false }, 'agent-result.json': { subtype: 'success', api_error: null, result: null } });
  expect(render().body).toContain('> [!WARNING]\n> The test agent stopped before it finished (ended without finishing its report), so this report is partial.\n');

  inputs();
  expect(render({ AGENT: 'failure' }).body).toContain('> [!WARNING]');
  expect(render().body).not.toContain('> [!WARNING]');
  expect(render().title).toBe('1 test added, all checks passed');
});

it('cuts a comment that is too long for GitHub', () => {
  const output = 'x'.repeat(4000);
  inputs({ 'test-agent-report.json': { ...report, suspectedBugs: Array.from({ length: 20 }, () => ({ ...suspectedBug, output })) } });

  const { body } = render();

  expect(body.length).toBeLessThanOrEqual(65_536);
  expect(body).toMatch(/\n\nThe comment was cut at 60000 characters\. The \[workflow run\]\(https:\/\/github\.com\/o\/r\/actions\/runs\/1\) has the full report in its test-agent-output artifact\.\n$/);
});

it.each([[[]], [['a', 'b']], [['/no/such/dir']]])('rejects args %j', (args) => {
  const { status, stderr } = spawnSync(script, args, { encoding: 'utf8', timeout: 30_000 });
  expect(stderr).toContain('test-agent-render:');
  expect(status).toBe(2);
});
