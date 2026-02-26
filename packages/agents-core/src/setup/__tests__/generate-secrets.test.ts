import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SetupConfig } from '../setup.js';

const mockExecImpl = vi.fn();

vi.mock('node:child_process', () => {
  const { promisify } = require('node:util');

  const mockExec = vi.fn((...args: unknown[]) => {
    const cmd = args[0] as string;
    const callback = args[args.length - 1] as (
      error: Error | null,
      stdout: string,
      stderr: string
    ) => void;
    const result = mockExecImpl(cmd);
    if (result instanceof Promise) {
      result.then(
        (r: { stdout: string; stderr: string }) => callback(null, r.stdout, r.stderr),
        (e: Error) => callback(e, '', '')
      );
    } else {
      callback(null, result?.stdout || '', result?.stderr || '');
    }
  });

  (mockExec as any)[promisify.custom] = (cmd: string) => {
    const result = mockExecImpl(cmd);
    if (result instanceof Promise) {
      return result;
    }
    return Promise.resolve(result || { stdout: '', stderr: '' });
  };

  return {
    exec: mockExec,
    spawn: vi.fn().mockReturnValue({
      pid: 12345,
      on: vi.fn(),
      unref: vi.fn(),
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
    }),
  };
});

vi.mock('dotenv', () => ({
  default: { config: vi.fn() },
  config: vi.fn(),
}));

vi.mock('../../env.js', () => ({
  loadEnvironmentFiles: vi.fn(),
}));

let mockEnvFileContent = '';
let writtenEnvContent = '';

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn((_path: string) => {
    if (_path === '.env') {
      return Promise.resolve(mockEnvFileContent);
    }
    return Promise.reject(new Error('ENOENT'));
  }),
  writeFile: vi.fn((_path: string, content: string) => {
    if (_path === '.env') {
      writtenEnvContent = content;
    }
    return Promise.resolve();
  }),
}));

vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => true),
  copyFileSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

const MOCK_HEX_32 = 'a'.repeat(64);
const MOCK_BASE64URL_6 = 'YQAAAA';

vi.mock('node:crypto', () => ({
  generateKeyPairSync: vi.fn(() => ({
    privateKey: 'MOCK_PEM_PRIVATE',
    publicKey: 'MOCK_PEM_PUBLIC',
  })),
  randomBytes: vi.fn((size: number) => {
    if (size === 32) {
      return { toString: (_enc: string) => MOCK_HEX_32 };
    }
    if (size === 6) {
      return { toString: (_enc: string) => MOCK_BASE64URL_6 };
    }
    return { toString: () => '' };
  }),
}));

describe('generateSecrets (via runSetup)', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    vi.clearAllMocks();
    mockEnvFileContent = '';
    writtenEnvContent = '';

    process.env.INKEEP_AGENTS_MANAGE_DATABASE_URL = 'postgresql://localhost:5432/test';
    process.env.INKEEP_AGENTS_RUN_DATABASE_URL = 'postgresql://localhost:5433/test';
    process.env.BETTER_AUTH_SECRET = 'test-secret';
    process.env.INKEEP_AGENTS_MANAGE_UI_USERNAME = 'admin@test.com';
    process.env.INKEEP_AGENTS_MANAGE_UI_PASSWORD = 'test-password';
    delete process.env.CI;

    mockExecImpl.mockImplementation(() => Promise.resolve({ stdout: '', stderr: '' }));
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.unstubAllGlobals();
  });

  function baseConfig(overrides?: Partial<SetupConfig>): SetupConfig {
    return {
      dockerComposeFile: 'docker-compose.db.yml',
      manageMigrateCommand: 'pnpm db:manage:migrate',
      runMigrateCommand: 'pnpm db:run:migrate',
      authInitCommand: 'pnpm db:auth:init',
      isCloud: true,
      ...overrides,
    };
  }

  it('should generate all 5 secrets when .env has all placeholders', async () => {
    mockEnvFileContent = [
      '# INKEEP_AGENTS_TEMP_JWT_PRIVATE_KEY=',
      '# INKEEP_AGENTS_TEMP_JWT_PUBLIC_KEY=',
      '# INKEEP_AGENTS_JWT_SIGNING_SECRET=',
      'BETTER_AUTH_SECRET=your-secret-key-change-in-production',
      'INKEEP_AGENTS_MANAGE_UI_PASSWORD=adminADMIN!@12',
    ].join('\n');

    const { runSetup } = await import('../setup.js');
    await runSetup(baseConfig());

    expect(writtenEnvContent).toContain('INKEEP_AGENTS_TEMP_JWT_PRIVATE_KEY=');
    expect(writtenEnvContent).not.toContain('# INKEEP_AGENTS_TEMP_JWT_PRIVATE_KEY=');
    expect(writtenEnvContent).toContain('INKEEP_AGENTS_TEMP_JWT_PUBLIC_KEY=');
    expect(writtenEnvContent).not.toContain('# INKEEP_AGENTS_TEMP_JWT_PUBLIC_KEY=');
    expect(writtenEnvContent).toContain(`INKEEP_AGENTS_JWT_SIGNING_SECRET=${MOCK_HEX_32}`);
    expect(writtenEnvContent).toContain(`BETTER_AUTH_SECRET=${MOCK_HEX_32}`);
    expect(writtenEnvContent).toContain(`INKEEP_AGENTS_MANAGE_UI_PASSWORD=${MOCK_BASE64URL_6}`);
    expect(writtenEnvContent).not.toContain('your-secret-key-change-in-production');
    expect(writtenEnvContent).not.toContain('adminADMIN!@12');
  });

  it('should preserve all user-customized values', async () => {
    mockEnvFileContent = [
      'INKEEP_AGENTS_TEMP_JWT_PRIVATE_KEY=my-real-private-key',
      'INKEEP_AGENTS_TEMP_JWT_PUBLIC_KEY=my-real-public-key',
      'INKEEP_AGENTS_JWT_SIGNING_SECRET=my-custom-signing-secret',
      'BETTER_AUTH_SECRET=my-custom-auth-secret',
      'INKEEP_AGENTS_MANAGE_UI_PASSWORD=my-strong-password',
    ].join('\n');

    const { runSetup } = await import('../setup.js');
    await runSetup(baseConfig());

    expect(writtenEnvContent).toBe('');
  });

  it('should only replace placeholders in a mixed .env', async () => {
    mockEnvFileContent = [
      'INKEEP_AGENTS_TEMP_JWT_PRIVATE_KEY=my-real-private-key',
      'INKEEP_AGENTS_TEMP_JWT_PUBLIC_KEY=my-real-public-key',
      'INKEEP_AGENTS_JWT_SIGNING_SECRET=my-custom-signing-secret',
      'BETTER_AUTH_SECRET=your-secret-key-change-in-production',
      'INKEEP_AGENTS_MANAGE_UI_PASSWORD=my-strong-password',
    ].join('\n');

    const { runSetup } = await import('../setup.js');
    await runSetup(baseConfig());

    expect(writtenEnvContent).toContain(`BETTER_AUTH_SECRET=${MOCK_HEX_32}`);
    expect(writtenEnvContent).toContain('INKEEP_AGENTS_TEMP_JWT_PRIVATE_KEY=my-real-private-key');
    expect(writtenEnvContent).toContain(
      'INKEEP_AGENTS_JWT_SIGNING_SECRET=my-custom-signing-secret'
    );
    expect(writtenEnvContent).toContain('INKEEP_AGENTS_MANAGE_UI_PASSWORD=my-strong-password');
  });

  it('should generate secrets when values are empty', async () => {
    mockEnvFileContent = [
      'INKEEP_AGENTS_TEMP_JWT_PRIVATE_KEY=existing-key',
      'INKEEP_AGENTS_TEMP_JWT_PUBLIC_KEY=existing-key',
      'INKEEP_AGENTS_JWT_SIGNING_SECRET=',
      'BETTER_AUTH_SECRET=',
      'INKEEP_AGENTS_MANAGE_UI_PASSWORD=',
    ].join('\n');

    const { runSetup } = await import('../setup.js');
    await runSetup(baseConfig());

    expect(writtenEnvContent).toContain(`INKEEP_AGENTS_JWT_SIGNING_SECRET=${MOCK_HEX_32}`);
    expect(writtenEnvContent).toContain(`BETTER_AUTH_SECRET=${MOCK_HEX_32}`);
    expect(writtenEnvContent).toContain(`INKEEP_AGENTS_MANAGE_UI_PASSWORD=${MOCK_BASE64URL_6}`);
    expect(writtenEnvContent).toContain('INKEEP_AGENTS_TEMP_JWT_PRIVATE_KEY=existing-key');
  });

  it('should append secrets when lines are missing from .env', async () => {
    mockEnvFileContent = [
      'INKEEP_AGENTS_TEMP_JWT_PRIVATE_KEY=existing-key',
      'INKEEP_AGENTS_TEMP_JWT_PUBLIC_KEY=existing-key',
      'ENVIRONMENT=development',
    ].join('\n');

    const { runSetup } = await import('../setup.js');
    await runSetup(baseConfig());

    expect(writtenEnvContent).toContain(`INKEEP_AGENTS_JWT_SIGNING_SECRET=${MOCK_HEX_32}`);
    expect(writtenEnvContent).toContain(`BETTER_AUTH_SECRET=${MOCK_HEX_32}`);
    expect(writtenEnvContent).toContain(`INKEEP_AGENTS_MANAGE_UI_PASSWORD=${MOCK_BASE64URL_6}`);
  });

  it('should sync process.env when replacing placeholder secrets', async () => {
    process.env.BETTER_AUTH_SECRET = 'your-secret-key-change-in-production';
    process.env.INKEEP_AGENTS_MANAGE_UI_PASSWORD = 'adminADMIN!@12';
    delete process.env.INKEEP_AGENTS_JWT_SIGNING_SECRET;

    mockEnvFileContent = [
      '# INKEEP_AGENTS_TEMP_JWT_PRIVATE_KEY=',
      '# INKEEP_AGENTS_TEMP_JWT_PUBLIC_KEY=',
      '# INKEEP_AGENTS_JWT_SIGNING_SECRET=',
      'BETTER_AUTH_SECRET=your-secret-key-change-in-production',
      'INKEEP_AGENTS_MANAGE_UI_PASSWORD=adminADMIN!@12',
    ].join('\n');

    const { runSetup } = await import('../setup.js');
    await runSetup(baseConfig());

    expect(process.env.BETTER_AUTH_SECRET).toBe(MOCK_HEX_32);
    expect(process.env.INKEEP_AGENTS_MANAGE_UI_PASSWORD).toBe(MOCK_BASE64URL_6);
    expect(process.env.INKEEP_AGENTS_JWT_SIGNING_SECRET).toBe(MOCK_HEX_32);
    expect(process.env.INKEEP_AGENTS_TEMP_JWT_PRIVATE_KEY).toBeDefined();
    expect(process.env.INKEEP_AGENTS_TEMP_JWT_PUBLIC_KEY).toBeDefined();
  });

  it('should not overwrite process.env for non-placeholder values', async () => {
    process.env.BETTER_AUTH_SECRET = 'my-real-secret';
    process.env.INKEEP_AGENTS_MANAGE_UI_PASSWORD = 'my-strong-password';

    mockEnvFileContent = [
      'INKEEP_AGENTS_TEMP_JWT_PRIVATE_KEY=my-real-private-key',
      'INKEEP_AGENTS_TEMP_JWT_PUBLIC_KEY=my-real-public-key',
      'INKEEP_AGENTS_JWT_SIGNING_SECRET=my-custom-signing-secret',
      'BETTER_AUTH_SECRET=my-real-secret',
      'INKEEP_AGENTS_MANAGE_UI_PASSWORD=my-strong-password',
    ].join('\n');

    const { runSetup } = await import('../setup.js');
    await runSetup(baseConfig());

    expect(process.env.BETTER_AUTH_SECRET).toBe('my-real-secret');
    expect(process.env.INKEEP_AGENTS_MANAGE_UI_PASSWORD).toBe('my-strong-password');
  });
});
