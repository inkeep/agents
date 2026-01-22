import { describe, expect, it, vi } from 'vitest';

const fsMocks = vi.hoisted(() => ({
  writeFileSyncMock: vi.fn(),
  mkdirSyncMock: vi.fn(),
  rmSyncMock: vi.fn(),
  existsSyncMock: vi.fn(() => true),
}));

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    writeFileSync: fsMocks.writeFileSyncMock,
    mkdirSync: fsMocks.mkdirSyncMock,
    rmSync: fsMocks.rmSyncMock,
    existsSync: fsMocks.existsSyncMock,
  };
});

vi.mock('node:os', async () => {
  const actual = await vi.importActual<typeof import('node:os')>('node:os');
  return { ...actual, tmpdir: () => '/tmp' };
});

vi.mock('node:child_process', () => {
  const { EventEmitter } = require('node:events');
  const { PassThrough } = require('node:stream');

  const spawn = vi.fn((cmd: string) => {
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.kill = vi.fn();

    // npm install path (we don't hit it when deps are empty), but keep it safe
    if (cmd === 'npm') {
      setImmediate(() => child.emit('close', 0));
      return child;
    }

    // node execution path
    setImmediate(() => {
      child.stdout.write(`ok\n${JSON.stringify({ success: true, result: { ok: true } })}\n`);
      child.stdout.end();
      child.stderr.end();
      child.emit('close', 0, null);
    });

    return child;
  });

  return { spawn };
});

import { NativeSandboxExecutor } from '../NativeSandboxExecutor';

describe('NativeSandboxExecutor concurrency', () => {
  it('writes per-invocation run files under runs/<id>/ without clobbering', async () => {
    const executor = new NativeSandboxExecutor();

    const config: any = {
      description: 'test',
      inputSchema: {},
      executeCode: 'async () => ({ ok: true })',
      dependencies: {},
      sandboxConfig: { provider: 'native', runtime: 'node22', timeout: 1000, vcpus: 2 },
    };

    fsMocks.writeFileSyncMock.mockClear();

    await Promise.all([
      executor.executeFunctionTool('tool', { a: 1 }, config),
      executor.executeFunctionTool('tool', { a: 2 }, config),
    ]);

    const written = fsMocks.writeFileSyncMock.mock.calls.map((c) => String(c[0]));
    const runWrites = written.filter((p) => p.includes('/runs/') && p.includes('index.'));

    // one package.json for sandbox init + two run files
    expect(runWrites.length).toBe(2);
    expect(runWrites[0]).not.toBe(runWrites[1]);
  });
});

