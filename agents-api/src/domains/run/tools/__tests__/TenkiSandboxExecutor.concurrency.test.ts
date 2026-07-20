import { describe, expect, it, vi } from 'vitest';

const createMock = vi.fn();
const whoAmIMock = vi.fn(async () => ({
  ownerType: 'user',
  ownerId: 'user_1',
  workspaces: [{ id: 'ws_1', name: 'workspace', projects: [{ id: 'prj_1', name: 'project' }] }],
}));

vi.mock('@tenkicloud/sandbox', () => ({
  TenkiSandbox: vi.fn(() => ({
    create: createMock,
    whoAmI: whoAmIMock,
  })),
}));

import { TenkiSandboxExecutor } from '../TenkiSandboxExecutor';

const encoder = new TextEncoder();

function streamOf(...chunks: Uint8Array[]) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
}

function openStream() {
  return new ReadableStream<Uint8Array>({ start() {} });
}

function runHandle(
  result: { exitCode: number },
  output?: { stdout?: Uint8Array[]; stderr?: Uint8Array[] }
) {
  return Object.assign(Promise.resolve(result), {
    kill: vi.fn(async () => {}),
    stdout: streamOf(...(output?.stdout ?? [])),
    stderr: streamOf(...(output?.stderr ?? [])),
  });
}

function createSessionMock(writtenPaths: string[]) {
  return {
    id: 'sbx_test',
    waitReady: vi.fn(async () => {}),
    writeFile: vi.fn(async (path: string, _content: string) => {
      writtenPaths.push(path);
    }),
    run: vi.fn((argv: string[]) => {
      if (argv[0] === 'node' && argv[1] !== '--version') {
        return runHandle(
          { exitCode: 0 },
          {
            stdout: [
              encoder.encode(`ok\n${JSON.stringify({ success: true, result: { ok: true } })}\n`),
            ],
          }
        );
      }
      if (argv[1] === '--version') {
        return runHandle({ exitCode: 0 }, { stdout: [encoder.encode('v22.11.0\n')] });
      }
      return runHandle({ exitCode: 0 });
    }),
    close: vi.fn(async () => {}),
  };
}

const baseConfig = {
  provider: 'tenki',
  authToken: 'tk_test',
  runtime: 'node22',
  timeout: 60000,
  vcpus: 1,
} as const;

describe('TenkiSandboxExecutor concurrency', () => {
  it('uses per-invocation run paths while creating the sandbox only once', async () => {
    createMock.mockReset();
    const executor = new TenkiSandboxExecutor({ ...baseConfig });

    const writtenPaths: string[] = [];
    createMock.mockResolvedValue(createSessionMock(writtenPaths));

    const toolConfig = {
      name: 'tool',
      executeCode: 'async (args) => args',
      dependencies: {},
      sandboxConfig: { ...baseConfig },
    };

    const res1 = executor.executeFunctionTool('fn', { a: 1 }, toolConfig as any);
    const res2 = executor.executeFunctionTool('fn', { a: 2 }, toolConfig as any);

    const [r1, r2] = await Promise.all([res1, res2]);

    expect(r1.success).toBe(true);
    expect(r1.result).toEqual({ ok: true });
    expect(r2.success).toBe(true);
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(writtenPaths.length).toBe(2);
    expect(writtenPaths[0]).toMatch(/^\/home\/tenki\/runs\//);
    expect(writtenPaths[1]).toMatch(/^\/home\/tenki\/runs\//);
    expect(writtenPaths[0]).not.toBe(writtenPaths[1]);
  });

  it('creates the sandbox with outbound networking and installs dependencies', async () => {
    createMock.mockReset();
    const executor = new TenkiSandboxExecutor({ ...baseConfig, vcpus: 2 });

    const writtenPaths: string[] = [];
    const session = createSessionMock(writtenPaths);
    createMock.mockResolvedValue(session);

    const toolConfig = {
      name: 'tool',
      executeCode: 'async (args) => args',
      dependencies: { 'left-pad': '^1.3.0' },
      sandboxConfig: { ...baseConfig, vcpus: 2 },
    };

    const result = await executor.executeFunctionTool('fn', {}, toolConfig as any);

    expect(result.success).toBe(true);
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        allowOutbound: true,
        cpuCores: 2,
        projectId: 'prj_1',
        waitReady: false,
      })
    );
    expect(session.waitReady).toHaveBeenCalled();
    const createOptions = createMock.mock.calls[0][0];
    expect(createOptions.maxDurationMs).toBeGreaterThan(60000);
    expect(session.writeFile).toHaveBeenCalledWith(
      '/home/tenki/package.json',
      expect.stringContaining('left-pad')
    );
    expect(session.run).toHaveBeenCalledWith(['npm', 'install', '--omit=dev'], expect.anything());
  });

  it('closes the session when readiness fails after the VM was created', async () => {
    createMock.mockReset();
    const executor = new TenkiSandboxExecutor({ ...baseConfig });

    const writtenPaths: string[] = [];
    const session = {
      ...createSessionMock(writtenPaths),
      waitReady: vi.fn(async () => {
        throw new Error('runtime failed to become ready');
      }),
    };
    createMock.mockResolvedValue(session);

    const toolConfig = {
      name: 'tool',
      executeCode: 'async (args) => args',
      dependencies: {},
      sandboxConfig: { ...baseConfig },
    };

    const result = await executor.executeFunctionTool('fn', {}, toolConfig as any);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/failed to become ready/);
    expect(session.close).toHaveBeenCalled();
  });

  it('kills a timed-out command, evicts the sandbox, and creates a fresh one next call', async () => {
    createMock.mockReset();
    const executor = new TenkiSandboxExecutor({ ...baseConfig, timeout: 100 });

    const killMock = vi.fn(async () => {});
    const hangingSession = {
      id: 'sbx_hang',
      waitReady: vi.fn(async () => {}),
      writeFile: vi.fn(async () => {}),
      run: vi.fn((argv: string[]) => {
        if (argv[0] === 'node' && argv[1] !== '--version') {
          return Object.assign(new Promise(() => {}), {
            kill: killMock,
            stdout: openStream(),
            stderr: openStream(),
          });
        }
        if (argv[1] === '--version') {
          return runHandle({ exitCode: 0 }, { stdout: [encoder.encode('v22.11.0\n')] });
        }
        return runHandle({ exitCode: 0 });
      }),
      close: vi.fn(async () => {}),
    };
    createMock.mockResolvedValue(hangingSession);

    const toolConfig = {
      name: 'tool',
      executeCode: 'async () => new Promise(() => {})',
      dependencies: {},
      sandboxConfig: { ...baseConfig, timeout: 100 },
    };

    const result = await executor.executeFunctionTool('fn', {}, toolConfig as any);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/timed out after 100ms/);
    expect(killMock).toHaveBeenCalled();

    await vi.waitFor(() => expect(hangingSession.close).toHaveBeenCalled());

    const writtenPaths: string[] = [];
    const freshSession = createSessionMock(writtenPaths);
    createMock.mockResolvedValue(freshSession);

    const retryConfig = {
      ...toolConfig,
      executeCode: 'async (args) => args',
    };
    const retry = await executor.executeFunctionTool('fn', {}, retryConfig as any);

    expect(retry.success).toBe(true);
    expect(createMock).toHaveBeenCalledTimes(2);
  });

  it('kills a command whose output exceeds the size limit and retires the sandbox', async () => {
    createMock.mockReset();
    const executor = new TenkiSandboxExecutor({ ...baseConfig });

    const bigChunk = new Uint8Array(600 * 1024);
    const killMock = vi.fn(async () => {});
    const session = {
      id: 'sbx_flood',
      waitReady: vi.fn(async () => {}),
      writeFile: vi.fn(async () => {}),
      run: vi.fn((argv: string[]) => {
        if (argv[0] === 'node' && argv[1] !== '--version') {
          return Object.assign(Promise.resolve({ exitCode: 0 }), {
            kill: killMock,
            stdout: streamOf(bigChunk, bigChunk),
            stderr: streamOf(),
          });
        }
        if (argv[1] === '--version') {
          return runHandle({ exitCode: 0 }, { stdout: [encoder.encode('v22.11.0\n')] });
        }
        return runHandle({ exitCode: 0 });
      }),
      close: vi.fn(async () => {}),
    };
    createMock.mockResolvedValue(session);

    const toolConfig = {
      name: 'tool',
      executeCode: "async () => 'x'.repeat(10_000_000)",
      dependencies: {},
      sandboxConfig: { ...baseConfig },
    };

    const result = await executor.executeFunctionTool('fn', {}, toolConfig as any);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Output size exceeded limit/);
    expect(killMock).toHaveBeenCalled();
    await vi.waitFor(() => expect(session.close).toHaveBeenCalled());
  });

  it('retires the sandbox when infrastructure fails mid-execution', async () => {
    createMock.mockReset();
    const executor = new TenkiSandboxExecutor({ ...baseConfig });

    const writtenPaths: string[] = [];
    const session = {
      ...createSessionMock(writtenPaths),
      writeFile: vi.fn(async () => {
        throw new Error('transport closed');
      }),
    };
    createMock.mockResolvedValue(session);

    const toolConfig = {
      name: 'tool',
      executeCode: 'async (args) => args',
      dependencies: {},
      sandboxConfig: { ...baseConfig },
    };

    const result = await executor.executeFunctionTool('fn', {}, toolConfig as any);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/transport closed/);
    await vi.waitFor(() => expect(session.close).toHaveBeenCalled());
  });

  it('closes a sandbox whose initialization completes after cleanup starts', async () => {
    createMock.mockReset();
    const executor = new TenkiSandboxExecutor({ ...baseConfig });

    const writtenPaths: string[] = [];
    const session = createSessionMock(writtenPaths);
    let resolveCreate: ((s: unknown) => void) | undefined;
    createMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCreate = resolve;
        })
    );

    const toolConfig = {
      name: 'tool',
      executeCode: 'async (args) => args',
      dependencies: {},
      sandboxConfig: { ...baseConfig },
    };

    const inFlight = executor.executeFunctionTool('fn', {}, toolConfig as any);
    await vi.waitFor(() => expect(resolveCreate).toBeDefined());

    const cleanupPromise = executor.cleanup();
    resolveCreate?.(session);

    await cleanupPromise;
    const result = await inFlight;

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/shut down during sandbox initialization/);
    expect(session.close).toHaveBeenCalled();
  });

  it('does not pool a session whose server-side deadline cannot cover a command', async () => {
    createMock.mockReset();
    const executor = new TenkiSandboxExecutor({ ...baseConfig, timeout: 60000 });

    const writtenPaths: string[] = [];
    const session = {
      ...createSessionMock(writtenPaths),
      timeoutAt: new Date(Date.now() + 10_000),
    };
    createMock.mockResolvedValue(session);

    const toolConfig = {
      name: 'tool',
      executeCode: 'async (args) => args',
      dependencies: {},
      sandboxConfig: { ...baseConfig, timeout: 60000 },
    };

    const result = await executor.executeFunctionTool('fn', {}, toolConfig as any);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/expired before first use/);
    await vi.waitFor(() => expect(session.close).toHaveBeenCalled());
  });

  it('retires by session identity so a replacement under the same hash survives', async () => {
    createMock.mockReset();
    const executor = new TenkiSandboxExecutor({ ...baseConfig });

    const writtenPaths: string[] = [];
    const session = createSessionMock(writtenPaths);
    createMock.mockResolvedValue(session);

    const toolConfig = {
      name: 'tool',
      executeCode: 'async (args) => args',
      dependencies: {},
      sandboxConfig: { ...baseConfig },
    };
    await executor.executeFunctionTool('fn', {}, toolConfig as any);

    const hash = (executor as any).generateDependencyHash({});
    expect((executor as any).sandboxPool.has(hash)).toBe(true);

    (executor as any).retireSandbox(hash, { id: 'sbx_other' });
    expect((executor as any).sandboxPool.has(hash)).toBe(true);
    expect(session.close).not.toHaveBeenCalled();

    (executor as any).retireSandbox(hash, session);
    expect((executor as any).sandboxPool.has(hash)).toBe(false);
    await vi.waitFor(() => expect(session.close).toHaveBeenCalled());
  });

  it('cleanup waits for a close that is already in flight', async () => {
    createMock.mockReset();
    const executor = new TenkiSandboxExecutor({ ...baseConfig });

    let resolveClose: (() => void) | undefined;
    const writtenPaths: string[] = [];
    const session = {
      ...createSessionMock(writtenPaths),
      close: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            resolveClose = resolve;
          })
      ),
    };
    createMock.mockResolvedValue(session);

    const toolConfig = {
      name: 'tool',
      executeCode: 'async (args) => args',
      dependencies: {},
      sandboxConfig: { ...baseConfig },
    };
    await executor.executeFunctionTool('fn', {}, toolConfig as any);

    (executor as any).retireSandbox((executor as any).generateDependencyHash({}));
    await vi.waitFor(() => expect(resolveClose).toBeDefined());

    let cleanupDone = false;
    const cleanupPromise = executor.cleanup().then(() => {
      cleanupDone = true;
    });

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(cleanupDone).toBe(false);

    resolveClose?.();
    await cleanupPromise;
    expect(cleanupDone).toBe(true);
  });

  it('defers closing an expired sandbox until its active executions finish', async () => {
    createMock.mockReset();
    const executor = new TenkiSandboxExecutor({ ...baseConfig });

    let releaseSlowNode: (() => void) | undefined;
    const session = {
      id: 'sbx_active',
      waitReady: vi.fn(async () => {}),
      writeFile: vi.fn(async () => {}),
      run: vi.fn((argv: string[]) => {
        if (argv[0] === 'node' && argv[1] !== '--version') {
          return Object.assign(
            new Promise((resolve) => {
              releaseSlowNode = () => resolve({ exitCode: 0 });
            }),
            {
              kill: vi.fn(async () => {}),
              stdout: streamOf(
                encoder.encode(`${JSON.stringify({ success: true, result: null })}\n`)
              ),
              stderr: streamOf(),
            }
          );
        }
        if (argv[1] === '--version') {
          return runHandle({ exitCode: 0 }, { stdout: [encoder.encode('v22.11.0\n')] });
        }
        return runHandle({ exitCode: 0 });
      }),
      close: vi.fn(async () => {}),
    };
    createMock.mockResolvedValue(session);

    const toolConfig = {
      name: 'tool',
      executeCode: 'async (args) => args',
      dependencies: {},
      sandboxConfig: { ...baseConfig },
    };

    const inFlight = executor.executeFunctionTool('fn', {}, toolConfig as any);
    await vi.waitFor(() => expect(releaseSlowNode).toBeDefined());

    (executor as any).retireSandbox((executor as any).generateDependencyHash({}));
    expect(session.close).not.toHaveBeenCalled();

    releaseSlowNode?.();
    const result = await inFlight;

    expect(result.success).toBe(true);
    await vi.waitFor(() => expect(session.close).toHaveBeenCalled());
  });
});
