import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const packageDir = fileURLToPath(new URL('../../', import.meta.url));
const packageJson = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8'));
const { packageManager } = JSON.parse(readFileSync(join(packageDir, '../../package.json'), 'utf8'));
let fixture: string;
let testTimeout: number;

function runRequiredTest() {
  const result = spawnSync('pnpm', ['test'], {
    cwd: fixture,
    env: { ...process.env, CI: 'true' },
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
    fixture = mkdtempSync(join(tmpdir(), 'create-agents-required-test-'));
    symlinkSync(join(packageDir, 'node_modules'), join(fixture, 'node_modules'), 'junction');
    mkdirSync(join(fixture, 'src/__tests__'), { recursive: true });
    writeFileSync(
      join(fixture, 'package.json'),
      JSON.stringify({
        type: 'module',
        packageManager,
        scripts: { test: packageJson.scripts.test },
      })
    );
    writeFileSync(
      join(fixture, 'vitest.config.ts'),
      'export default { test: { maxWorkers: 1, minWorkers: 1 } };'
    );
  });

  afterEach(() => {
    rmSync(fixture, { recursive: true, force: true });
  });

  it.each([true, false])('reports the outcome of a collected test that passes=%j', (passes) => {
    writeFileSync(
      join(fixture, 'src/__tests__/unit.test.ts'),
      `import { expect, it } from 'vitest'; it('unit', () => expect(${passes}).toBe(true));`
    );
    const result = runRequiredTest();
    expect(result.status, result.stdout + result.stderr).toBe(passes ? 0 : 1);
  });

  it('fails when the test glob collects no tests', () => {
    const result = runRequiredTest();
    expect(result.stdout + result.stderr).toContain('No test files found');
    expect(result.status, result.stdout + result.stderr).toBe(1);
  });
});
