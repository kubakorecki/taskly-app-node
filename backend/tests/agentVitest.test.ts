import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// scripts/agent-vitest.sh is the only way the test agent runs tests, so test code must not see its tokens.
const wrapper = fileURLToPath(new URL('../../scripts/agent-vitest.sh', import.meta.url));
const backendDir = fileURLToPath(new URL('..', import.meta.url));
const probe = `tests/agent-env-probe-${randomUUID()}.test.ts`;
// TZ is on the allow-list, so it marks nested runs: this file must not run again inside one (a broken
// wrapper could let it), and a probe left behind by a crash skips itself in ordinary runs.
const nestedTz = 'Pacific/Kiritimati';
const envWithSecrets = {
  PATH: process.env.PATH, HOME: process.env.HOME, TZ: nestedTz,
  CLAUDE_CODE_OAUTH_TOKEN: 'oauth-secret', GITHUB_TOKEN: 'github-secret',
};
const run = (cmd: string, args: string[]) =>
  spawnSync(cmd, args, { cwd: backendDir, env: envWithSecrets, encoding: 'utf8', timeout: 30_000 });

describe.skipIf(process.env.TZ === nestedTz)('agent vitest wrapper', { timeout: 60_000 }, () => {
  beforeAll(() => writeFileSync(`${backendDir}/${probe}`, `import { expect, it } from 'vitest';
it.skipIf(process.env.TZ !== '${nestedTz}')('hides the tokens from test code', () => {
  expect(process.env.CLAUDE_CODE_OAUTH_TOKEN).toBeUndefined();
  expect(process.env.GITHUB_TOKEN).toBeUndefined();
});
`));
  afterAll(() => rmSync(`${backendDir}/${probe}`, { force: true }));

  it('hides the tokens from test code', () => {
    expect(run('npx', ['--no', 'vitest', 'run', probe]).stdout).toContain('1 failed');
    const { status, stdout } = run(wrapper, ['backend', probe]);
    expect(stdout).toContain('1 passed');
    expect(status).toBe(0);
  });
  it('passes vitest args through and exits with vitest exit code', () => {
    expect(run(wrapper, ['backend', probe, '--reporter=dot', '-t', 'hides the tokens']).status).toBe(0);
    expect(run(wrapper, ['backend', 'tests/no-such-file.test.ts']).status).toBe(1);
  });
  it.each([
    [], ['frontend2'], ['../backend'], ['backend/'], ['BACKEND'], [' backend'],
    ...[
      'tests;id', 'tests|id', 'tests&id', '$(id)', '`id`', 'tests>out', 'tests<in', 'tests/*', "'x'", '"x"',
      'tests\nid', 'tests\\x', '~/x', '{a,b}', 'tests?', '!x', '#x',
      '../frontend', 'tests/../../frontend', '..', '--root=..', '--dir=src:..', '/etc/passwd',
      '--coverage.reportsDirectory=/tmp/x', '--coverage.reportsDirectory=coverage,/tmp',
      '--coverage.include=src/a.ts,../frontend/src/x.ts', '--outputFile=x@/tmp/y', '-t /tmp',
    ].map((arg) => ['backend', arg]),
  ])('rejects args %j', (...args) => {
    const { status, stderr } = run(wrapper, args);
    expect(stderr).toContain('agent-vitest:');
    expect(status).toBe(2);
  });
});
