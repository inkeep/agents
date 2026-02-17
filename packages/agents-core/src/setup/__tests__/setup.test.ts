import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SetupConfig } from '../setup.js';

const mockExecImpl = vi.fn();
const mockSpawn = vi.fn();

vi.mock('node:child_process', () => ({
  exec: vi.fn((...args: unknown[]) => {
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
  }),
  spawn: (...args: unknown[]) => mockSpawn(...args),
}));

vi.mock('dotenv', () => ({
  default: { config: vi.fn() },
  config: vi.fn(),
}));

vi.mock('../../env.js', () => ({
  loadEnvironmentFiles: vi.fn(),
}));

describe('runSetup', () => {
  let originalEnv: NodeJS.ProcessEnv;
  const mockFetch = vi.fn();

  beforeEach(() => {
    originalEnv = { ...process.env };
    vi.clearAllMocks();
    vi.stubGlobal('fetch', mockFetch);

    process.env.INKEEP_AGENTS_MANAGE_DATABASE_URL = 'postgresql://localhost:5432/test';
    process.env.INKEEP_AGENTS_RUN_DATABASE_URL = 'postgresql://localhost:5433/test';
    process.env.INKEEP_AGENTS_TEMP_JWT_PRIVATE_KEY = 'existing-key';
    process.env.INKEEP_AGENTS_TEMP_JWT_PUBLIC_KEY = 'existing-key';
    process.env.BETTER_AUTH_SECRET = 'test-secret';
    process.env.INKEEP_AGENTS_MANAGE_UI_USERNAME = 'admin@test.com';
    process.env.INKEEP_AGENTS_MANAGE_UI_PASSWORD = 'test-password';

    mockExecImpl.mockImplementation((cmd: string) => {
      if (cmd.includes('docker inspect')) {
        return Promise.resolve({ stdout: 'healthy', stderr: '' });
      }
      return Promise.resolve({ stdout: '', stderr: '' });
    });

    mockSpawn.mockReturnValue({
      pid: 12345,
      on: vi.fn(),
      unref: vi.fn(),
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
    });

    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));
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

  it('should run migrations and auth init for a basic config', async () => {
    const { runSetup } = await import('../setup.js');

    await runSetup(baseConfig());

    expect(mockExecImpl).toHaveBeenCalledWith('pnpm db:manage:migrate');
    expect(mockExecImpl).toHaveBeenCalledWith('pnpm db:run:migrate');
    expect(mockExecImpl).toHaveBeenCalledWith('pnpm db:auth:init');
  });

  it('should skip Docker when isCloud is true', async () => {
    const { runSetup } = await import('../setup.js');

    await runSetup(baseConfig({ isCloud: true }));

    const dockerCalls = mockExecImpl.mock.calls.filter((c: unknown[]) =>
      (c[0] as string).includes('docker-compose')
    );
    expect(dockerCalls).toHaveLength(0);
  });

  it('should skip project push when pushProject is not configured', async () => {
    const { runSetup } = await import('../setup.js');

    await runSetup(baseConfig());

    const pushCalls = mockExecImpl.mock.calls.filter((c: unknown[]) =>
      (c[0] as string).includes('inkeep push')
    );
    expect(pushCalls).toHaveLength(0);
  });

  it('should skip project push when skipPush is true', async () => {
    const { runSetup } = await import('../setup.js');

    await runSetup(
      baseConfig({
        skipPush: true,
        pushProject: {
          projectPath: 'src/projects/test',
          configPath: 'src/inkeep.config.ts',
          apiKey: 'test-bypass-secret',
        },
        apiHealthUrl: 'http://localhost:3002/health',
      })
    );

    const pushCalls = mockExecImpl.mock.calls.filter((c: unknown[]) =>
      (c[0] as string).includes('inkeep push')
    );
    expect(pushCalls).toHaveLength(0);
  });

  it('should warn and skip push when no API key is available', async () => {
    const { runSetup } = await import('../setup.js');
    mockFetch.mockResolvedValue({ ok: true, status: 200 });
    delete process.env.INKEEP_AGENTS_MANAGE_API_BYPASS_SECRET;

    await runSetup(
      baseConfig({
        pushProject: {
          projectPath: 'src/projects/test',
          configPath: 'src/inkeep.config.ts',
        },
        apiHealthUrl: 'http://localhost:3002/health',
      })
    );

    const pushCalls = mockExecImpl.mock.calls.filter((c: unknown[]) =>
      (c[0] as string).includes('inkeep push')
    );
    expect(pushCalls).toHaveLength(0);
  });

  it('should detect running API server and not spawn a new one', async () => {
    const { runSetup } = await import('../setup.js');
    mockFetch.mockResolvedValue({ ok: true, status: 200 });

    await runSetup(
      baseConfig({
        pushProject: {
          projectPath: 'src/projects/test',
          configPath: 'src/inkeep.config.ts',
          apiKey: 'test-bypass-secret',
        },
        devApiCommand: 'pnpm dev:api',
        apiHealthUrl: 'http://localhost:3002/health',
      })
    );

    expect(mockSpawn).not.toHaveBeenCalled();
    expect(mockExecImpl).toHaveBeenCalledWith(expect.stringContaining('inkeep push'));
  });

  it('should start API server temporarily when not already running', async () => {
    const { runSetup } = await import('../setup.js');
    let fetchCount = 0;
    mockFetch.mockImplementation(() => {
      fetchCount++;
      if (fetchCount <= 1) return Promise.reject(new Error('ECONNREFUSED'));
      return Promise.resolve({ ok: true, status: 200 });
    });

    await runSetup(
      baseConfig({
        pushProject: {
          projectPath: 'src/projects/test',
          configPath: 'src/inkeep.config.ts',
          apiKey: 'test-bypass-secret',
        },
        devApiCommand: 'pnpm dev:api',
        apiHealthUrl: 'http://localhost:3002/health',
      })
    );

    expect(mockSpawn).toHaveBeenCalledWith(
      'sh',
      ['-c', 'pnpm dev:api'],
      expect.objectContaining({ detached: true })
    );
  });

  it('should skip auth init when credentials are not configured', async () => {
    const { runSetup } = await import('../setup.js');
    delete process.env.INKEEP_AGENTS_MANAGE_UI_USERNAME;
    delete process.env.INKEEP_AGENTS_MANAGE_UI_PASSWORD;
    delete process.env.BETTER_AUTH_SECRET;

    await runSetup(baseConfig());

    const authCalls = mockExecImpl.mock.calls.filter((c: unknown[]) =>
      (c[0] as string).includes('db:auth:init')
    );
    expect(authCalls).toHaveLength(0);
  });

  it('should push project with correct command format', async () => {
    const { runSetup } = await import('../setup.js');
    mockFetch.mockResolvedValue({ ok: true, status: 200 });

    await runSetup(
      baseConfig({
        pushProject: {
          projectPath: 'src/projects/my-project',
          configPath: 'src/inkeep.config.ts',
          apiKey: 'test-bypass-secret',
        },
        apiHealthUrl: 'http://localhost:3002/health',
      })
    );

    expect(mockExecImpl).toHaveBeenCalledWith(
      'pnpm inkeep push --project src/projects/my-project --config src/inkeep.config.ts'
    );
  });

  it('should exit if database URLs are missing (non-cloud)', async () => {
    const { runSetup } = await import('../setup.js');
    delete process.env.INKEEP_AGENTS_MANAGE_DATABASE_URL;
    delete process.env.INKEEP_AGENTS_RUN_DATABASE_URL;

    const mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as never);

    await expect(runSetup(baseConfig({ isCloud: false }))).rejects.toThrow('process.exit called');
    expect(mockExit).toHaveBeenCalledWith(1);
    mockExit.mockRestore();
  });
});
