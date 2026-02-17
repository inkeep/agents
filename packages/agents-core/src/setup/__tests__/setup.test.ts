import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SetupConfig } from '../setup.js';

const mockExecImpl = vi.fn();
const mockSpawn = vi.fn();
const execCalls: Array<{ cmd: string; options?: Record<string, unknown> }> = [];

vi.mock('node:child_process', () => {
  const { promisify } = require('node:util');

  const mockExec = vi.fn((...args: unknown[]) => {
    const cmd = args[0] as string;
    const options = args.length === 3 ? (args[1] as Record<string, unknown>) : undefined;
    const callback = args[args.length - 1] as (
      error: Error | null,
      stdout: string,
      stderr: string
    ) => void;
    execCalls.push({ cmd, options });
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

  // Attach custom promisify so util.promisify(exec) returns { stdout, stderr }
  (mockExec as any)[promisify.custom] = (cmd: string, options?: Record<string, unknown>) => {
    execCalls.push({ cmd, options });
    const result = mockExecImpl(cmd);
    if (result instanceof Promise) {
      return result;
    }
    return Promise.resolve(result || { stdout: '', stderr: '' });
  };

  return {
    exec: mockExec,
    spawn: (...args: unknown[]) => mockSpawn(...args),
  };
});

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
    execCalls.length = 0;
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
      if (cmd.includes('docker-compose') && cmd.includes('config --format json')) {
        return Promise.resolve({ stdout: JSON.stringify({ name: 'test-project' }), stderr: '' });
      }
      // lsof fails when no process is listening (ports are free by default)
      if (cmd.includes('lsof -i :')) {
        return Promise.reject(new Error('no process found'));
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

  it('should attempt push without CI mode when no API key is available', async () => {
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

    // Push should still be attempted — CLI resolves auth from keychain/profile
    const pushCall = execCalls.find((c) => c.cmd.includes('inkeep push'));
    expect(pushCall).toBeDefined();
    // Should NOT set CI mode env vars when no bypass secret
    const env = (pushCall?.options as { env: Record<string, string> })?.env;
    expect(env?.INKEEP_CI).toBeUndefined();
    expect(env?.INKEEP_API_KEY).toBeUndefined();
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

  it('should pass INKEEP_CI, INKEEP_API_KEY, and INKEEP_TENANT_ID env vars when pushing with bypass secret', async () => {
    const { runSetup } = await import('../setup.js');
    mockFetch.mockResolvedValue({ ok: true, status: 200 });

    await runSetup(
      baseConfig({
        pushProject: {
          projectPath: 'src/projects/test',
          configPath: 'src/inkeep.config.ts',
          apiKey: 'my-bypass-secret',
        },
        apiHealthUrl: 'http://localhost:3002/health',
      })
    );

    const pushCall = execCalls.find((c) => c.cmd.includes('inkeep push'));
    expect(pushCall).toBeDefined();
    expect(pushCall?.options).toBeDefined();
    const env = (pushCall?.options as { env: Record<string, string> })?.env;
    expect(env?.INKEEP_CI).toBe('true');
    expect(env?.INKEEP_API_KEY).toBe('my-bypass-secret');
    expect(env?.INKEEP_TENANT_ID).toBe('default');
  });

  it('should skip docker startup when preflight detects port conflicts', async () => {
    const { runSetup } = await import('../setup.js');

    mockExecImpl.mockImplementation((cmd: string) => {
      // lsof succeeds = port is in use
      if (cmd.includes('lsof -i :')) {
        return Promise.resolve({ stdout: '12345', stderr: '' });
      }
      // docker ps returns a foreign container name
      if (cmd.includes('docker ps') && cmd.includes('--filter')) {
        return Promise.resolve({ stdout: 'other-project-doltgres-db-1', stderr: '' });
      }
      if (cmd.includes('docker-compose') && cmd.includes('config --format json')) {
        return Promise.resolve({ stdout: JSON.stringify({ name: 'test-project' }), stderr: '' });
      }
      return Promise.resolve({ stdout: '', stderr: '' });
    });

    await runSetup(baseConfig({ isCloud: false }));

    // Should NOT have tried docker-compose up -d
    const upCalls = mockExecImpl.mock.calls.filter(
      (c: unknown[]) =>
        (c[0] as string).includes('docker-compose') && (c[0] as string).includes('up -d')
    );
    expect(upCalls).toHaveLength(0);

    // Should still run migrations
    expect(mockExecImpl).toHaveBeenCalledWith('pnpm db:manage:migrate');
    expect(mockExecImpl).toHaveBeenCalledWith('pnpm db:run:migrate');
  });

  it('should proceed with docker startup when ports are free', async () => {
    const { runSetup } = await import('../setup.js');

    await runSetup(baseConfig({ isCloud: false }));

    const upCalls = mockExecImpl.mock.calls.filter(
      (c: unknown[]) =>
        (c[0] as string).includes('docker-compose') && (c[0] as string).includes('up -d')
    );
    expect(upCalls).toHaveLength(1);
  });

  it('should continue when docker compose times out during startup', async () => {
    const { runSetup } = await import('../setup.js');
    const origImpl = mockExecImpl.getMockImplementation();
    mockExecImpl.mockImplementation((cmd: string) => {
      if (cmd.includes('docker-compose') && cmd.includes('up -d')) {
        const err = new Error('Command timed out');
        (err as any).killed = true;
        (err as any).signal = 'SIGTERM';
        return Promise.reject(err);
      }
      return origImpl?.(cmd) ?? Promise.resolve({ stdout: '', stderr: '' });
    });

    await runSetup(baseConfig({ isCloud: false }));

    expect(mockExecImpl).toHaveBeenCalledWith('pnpm db:manage:migrate');
    expect(mockExecImpl).toHaveBeenCalledWith('pnpm db:run:migrate');
  });

  it('should skip docker when not available but database URLs are set', async () => {
    const { runSetup } = await import('../setup.js');
    mockExecImpl.mockImplementation((cmd: string) => {
      if (cmd === 'docker info') {
        return Promise.reject(new Error('docker not found'));
      }
      return Promise.resolve({ stdout: '', stderr: '' });
    });

    await runSetup(baseConfig({ isCloud: false }));

    expect(mockExecImpl).toHaveBeenCalledWith('pnpm db:manage:migrate');
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
