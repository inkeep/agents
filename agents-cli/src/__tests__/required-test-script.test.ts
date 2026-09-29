import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const packageDir = fileURLToPath(new URL('../../', import.meta.url));
const packageJson = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8'));
const { packageManager } = JSON.parse(readFileSync(join(packageDir, '../package.json'), 'utf8'));
let fixture: string;
let testTimeout: number;

function writeSuite(name: string, passes = true) {
  writeFileSync(
    join(fixture, `${name}.test.ts`),
    `import { writeFileSync } from 'node:fs';
import { expect, it } from 'vitest';
it('${name}', () => {
  writeFileSync('${name}-ran', 'yes');
  expect(${passes}).toBe(true);
});`
  );
}

function runRequiredTest(ci: string) {
  const result = spawnSync('pnpm', ['test'], {
    cwd: fixture,
    env: { ...process.env, CI: ci },
    encoding: 'utf8',
    shell: process.platform === 'win32',
    timeout: testTimeout,
  });
  expect(result.error).toBeUndefined();
  expect(result.signal).toBeNull();
  return result;
}

describe('required test script', () => {
  beforeEach(({ task }) => {
    testTimeout = task.timeout;
    fixture = mkdtempSync(join(tmpdir(), 'agents-cli-required-test-'));
    symlinkSync(join(packageDir, 'node_modules'), join(fixture, 'node_modules'), 'junction');
    writeFileSync(
      join(fixture, 'package.json'),
      JSON.stringify({
        type: 'module',
        packageManager,
        scripts: { test: packageJson.scripts.test },
      })
    );
    for (const [config, suite] of [
      ['vitest.config.ts', 'local'],
      ['vitest.config.ci.ts', 'ci'],
      ['vitest.integration.config.ts', 'integration'],
    ] as const) {
      writeFileSync(
        join(fixture, config),
        `export default { test: { include: ['${suite}.test.ts'], maxWorkers: 1, minWorkers: 1 } };`
      );
      writeSuite(suite);
    }
  });

  afterEach(() => {
    rmSync(fixture, { recursive: true, force: true });
  });

  it.each(['', 'true'])('runs the selected suite and integration tests with CI=%j', (ci) => {
    const result = runRequiredTest(ci);
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(existsSync(join(fixture, `${ci ? 'ci' : 'local'}-ran`))).toBe(true);
    expect(existsSync(join(fixture, `${ci ? 'local' : 'ci'}-ran`))).toBe(false);
    expect(existsSync(join(fixture, 'integration-ran'))).toBe(true);
  });

  it('fails when the CI configuration cannot load', () => {
    writeFileSync(join(fixture, 'vitest.config.ci.ts'), "throw new Error('CI config failure');");
    const result = runRequiredTest('true');
    expect(result.stderr).toContain('CI config failure');
    expect(result.status, result.stdout + result.stderr).toBe(1);
    expect(existsSync(join(fixture, 'local-ran'))).toBe(false);
    expect(existsSync(join(fixture, 'integration-ran'))).toBe(false);
  });

  it.each(['', 'true'])('preserves a selected suite failure with CI=%j', (ci) => {
    writeSuite(ci ? 'ci' : 'local', false);
    const result = runRequiredTest(ci);
    expect(result.status, result.stdout + result.stderr).toBe(1);
    expect(existsSync(join(fixture, `${ci ? 'local' : 'ci'}-ran`))).toBe(false);
    expect(existsSync(join(fixture, 'integration-ran'))).toBe(false);
  });

  it('preserves an integration test failure', () => {
    writeSuite('integration', false);
    const result = runRequiredTest('true');
    expect(result.status, result.stdout + result.stderr).toBe(1);
    expect(existsSync(join(fixture, 'ci-ran'))).toBe(true);
    expect(existsSync(join(fixture, 'integration-ran'))).toBe(true);
  });
});
