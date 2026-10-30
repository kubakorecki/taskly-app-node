import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// scripts/agent-tsc.sh is how the test agent typechecks its tests, in the same clean environment as Vitest (docs/adr/0003).
const wrapper = fileURLToPath(new URL('../agent-tsc.sh', import.meta.url));
const backendDir = fileURLToPath(new URL('../../backend', import.meta.url));
// A copy of the wrapper next to a one-file backend package, so a probe with a type error never lands in the real one.
const tmp = mkdtempSync(`${tmpdir()}/agent-tsc-`);
const wrapperCopy = `${tmp}/scripts/agent-tsc.sh`;
const pkg = `${tmp}/backend`;
// NODE_OPTIONS is on the allow-list, so this runs in every node process the wrapper starts and records what it sees.
const probe = `${tmp}/probe.cjs`;
const probeLog = `${tmp}/probe-log.jsonl`;
const envWithSecrets = {
  PATH: process.env.PATH, HOME: process.env.HOME, NODE_OPTIONS: `--require ${probe}`,
  CLAUDE_CODE_OAUTH_TOKEN: 'oauth-secret', GITHUB_TOKEN: 'github-secret',
};
const run = (cmd: string, args: string[]) =>
  spawnSync(cmd, args, { cwd: pkg, env: envWithSecrets, encoding: 'utf8', timeout: 60_000 });
const takeRecords = () => {
  const lines = readFileSync(probeLog, 'utf8').trim().split('\n');
  rmSync(probeLog);
  return lines.map((line) => JSON.parse(line) as { script: string; oauth?: string; github?: string });
};

describe('agent tsc wrapper', { timeout: 120_000 }, () => {
  beforeAll(() => {
    mkdirSync(`${tmp}/scripts`);
    mkdirSync(pkg);
    copyFileSync(wrapper, wrapperCopy);
    symlinkSync(`${backendDir}/node_modules`, `${pkg}/node_modules`);
    writeFileSync(`${pkg}/package.json`, '{ "private": true }\n');
    writeFileSync(`${pkg}/tsconfig.json`, '{ "compilerOptions": { "strict": true, "noEmit": true, "types": [] }, "include": ["*.ts"] }\n');
    writeFileSync(`${pkg}/good.ts`, 'export const n: number = 1;\n');
    writeFileSync(probe, `require('node:fs').appendFileSync(${JSON.stringify(probeLog)}, JSON.stringify({
  script: process.argv[1], oauth: process.env.CLAUDE_CODE_OAUTH_TOKEN, github: process.env.GITHUB_TOKEN,
}) + '\\n');
`);
  });
  afterAll(() => rmSync(tmp, { recursive: true, force: true }));

  it('hides the tokens from tsc', () => {
    run('npx', ['--no', 'tsc', '--noEmit']);
    expect(takeRecords()).toContainEqual(expect.objectContaining({ oauth: 'oauth-secret', github: 'github-secret' }));

    expect(run(wrapperCopy, ['backend']).status).toBe(0);
    const seenByWrapper = takeRecords();
    expect(seenByWrapper).toContainEqual(expect.objectContaining({ script: expect.stringMatching(/\/tsc$/) }));
    for (const { oauth, github } of seenByWrapper) {
      expect(oauth).toBeUndefined();
      expect(github).toBeUndefined();
    }
  });
  it('exits non-zero on a type error', () => {
    writeFileSync(`${pkg}/bad.ts`, "export const n: number = 'one';\n");
    const { status, stdout } = run(wrapperCopy, ['backend']);
    rmSync(`${pkg}/bad.ts`);
    expect(stdout).toContain('bad.ts(1,14): error TS2322');
    expect(status).toBe(2);
  });
  it.each([
    [], ['frontend2'], ['../backend'], ['backend/'], ['BACKEND'], [' backend'], [''], ['scripts'],
    ['backend', 'tests/router.test.ts'], ['backend', '--noEmit'], ['backend', '-p', '/tmp/tsconfig.json'],
    ['frontend', '--build'], ['backend', ''], ['backend', 'frontend'],
  ])('rejects args %j', (...args) => {
    const { status, stderr } = run(wrapper, args);
    expect(stderr).toContain('agent-tsc:');
    expect(status).toBe(2);
  });
});
