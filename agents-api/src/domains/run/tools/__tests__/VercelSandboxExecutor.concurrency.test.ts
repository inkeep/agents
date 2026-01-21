import { describe, expect, it, vi } from 'vitest';

vi.mock('@vercel/sandbox', () => ({
  Sandbox: {
    create: vi.fn(),
  },
}));

import { Sandbox } from '@vercel/sandbox';
import { VercelSandboxExecutor } from '../VercelSandboxExecutor';

describe('VercelSandboxExecutor concurrency', () => {
  it('uses per-invocation run paths while creating the sandbox only once', async () => {
    const executor = new VercelSandboxExecutor({
      provider: 'vercel',
      teamId: 'team',
      projectId: 'project',
      token: 'token',
      runtime: 'node22',
      timeout: 1000,
      vcpus: 1,
    });

    const writtenPaths: string[] = [];
    const sandbox = {
      sandboxId: 'sbx_test',
      writeFiles: vi.fn(async (files: Array<{ path: string; content: Buffer }>) => {
        for (const f of files) {
          writtenPaths.push(f.path);
        }
      }),
      runCommand: vi.fn(async (params: { cmd: string; cwd?: string }) => {
        if (params.cmd === 'node') {
          return {
            exitCode: 0,
            stdout: async () => `ok\n${JSON.stringify({ success: true, result: { ok: true } })}\n`,
            stderr: async () => '',
          };
        }
        return {
          exitCode: 0,
          stdout: async () => '',
          stderr: async () => '',
        };
      }),
      stop: vi.fn(async () => {}),
    };

    (Sandbox.create as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(sandbox);

    const toolConfig = {
      name: 'tool',
      executeCode: 'async (args) => args',
      dependencies: {},
      sandboxConfig: {
        provider: 'vercel',
        teamId: 'team',
        projectId: 'project',
        token: 'token',
        runtime: 'node22',
        timeout: 1000,
        vcpus: 1,
      },
    };

    const res1 = executor.executeFunctionTool('fn', { a: 1 }, toolConfig as any);
    const res2 = executor.executeFunctionTool('fn', { a: 2 }, toolConfig as any);

    await Promise.all([res1, res2]);

    expect(Sandbox.create).toHaveBeenCalledTimes(1);
    expect(writtenPaths.length).toBe(2);
    expect(writtenPaths[0]).toMatch(/^runs\//);
    expect(writtenPaths[1]).toMatch(/^runs\//);
    expect(writtenPaths[0]).not.toBe(writtenPaths[1]);
  });
});

