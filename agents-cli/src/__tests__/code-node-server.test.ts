import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type MockSpawnBehavior = {
  stdout?: string;
  stderr?: string;
  exitCode?: number | null;
  signal?: NodeJS.Signals | null;
  autoClose?: boolean;
};

const mockChildProcessState = vi.hoisted(() => ({
  gitStatuses: [] as string[],
  spawnBehaviors: [] as MockSpawnBehavior[],
  spawnCalls: [] as Array<{
    command: string;
    args: string[];
    child: {
      kill: ReturnType<typeof vi.fn>;
    };
  }>,
}));

vi.mock('node:child_process', async () => {
  const { EventEmitter } = await import('node:events');
  const { PassThrough } = await import('node:stream');

  const spawnSync = vi.fn((command: string, args: string[]) => {
    if (command === 'git' && args.includes('status')) {
      return {
        status: 0,
        stdout: mockChildProcessState.gitStatuses.shift() ?? '',
        stderr: '',
      };
    }

    return {
      status: 0,
      stdout: '',
      stderr: '',
    };
  });

  const spawn = vi.fn((command: string, args: string[]) => {
    const behavior = mockChildProcessState.spawnBehaviors.shift() ?? {};
    const emitter = new EventEmitter() as EventEmitter & {
      stdout: PassThrough;
      stderr: PassThrough;
      stdin: PassThrough;
      kill: ReturnType<typeof vi.fn>;
      killed?: boolean;
    };

    emitter.stdout = new PassThrough();
    emitter.stderr = new PassThrough();
    emitter.stdin = new PassThrough();

    let settled = false;
    const settle = (exitCode: number | null, signal: NodeJS.Signals | null) => {
      if (settled) {
        return;
      }
      settled = true;
      emitter.killed = signal !== null;
      if (behavior.stdout) {
        emitter.stdout.write(behavior.stdout);
      }
      if (behavior.stderr) {
        emitter.stderr.write(behavior.stderr);
      }
      emitter.stdout.end();
      emitter.stderr.end();
      emitter.emit('exit', exitCode, signal);
      emitter.emit('close', exitCode, signal);
    };

    emitter.kill = vi.fn((signal: NodeJS.Signals = 'SIGTERM') => {
      settle(null, signal);
      return true;
    });

    mockChildProcessState.spawnCalls.push({
      command,
      args,
      child: emitter,
    });

    if (behavior.autoClose !== false) {
      process.nextTick(() => {
        settle(behavior.exitCode ?? 0, behavior.signal ?? null);
      });
    }

    return emitter;
  });

  return {
    spawn,
    spawnSync,
  };
});

import { startCodeNodeServer } from '../utils/code-node-server';

const startedServers: Array<{ close: () => Promise<void> }> = [];
const tempDirs: string[] = [];

async function makeWorkspace(): Promise<string> {
  const workspace = await mkdtemp(path.join(tmpdir(), 'inkeep-code-node-'));
  tempDirs.push(workspace);
  return workspace;
}

async function postJson(url: string, body: unknown): Promise<any> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return await response.json();
}

beforeEach(() => {
  mockChildProcessState.gitStatuses.length = 0;
  mockChildProcessState.spawnBehaviors.length = 0;
  mockChildProcessState.spawnCalls.length = 0;
});

afterEach(async () => {
  while (startedServers.length > 0) {
    const server = startedServers.pop();
    if (server) {
      await server.close();
    }
  }

  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      await rm(dir, { recursive: true, force: true });
    }
  }
});

describe('code node server', () => {
  it('serves an agent card and handles blocking message/send', async () => {
    const workspace = await makeWorkspace();
    mockChildProcessState.gitStatuses.push('', '');
    mockChildProcessState.spawnBehaviors.push({ stdout: 'Runner finished' });

    const started = await startCodeNodeServer({
      host: '127.0.0.1',
      port: 0,
      workspaceRoot: workspace,
      runnerCommand: 'node',
      runnerArgs: ['-e', 'process.stdout.write(process.argv[1])', '{prompt}'],
      allowWrite: false,
      defaultTimeoutMs: 5_000,
      name: 'Test Code Node',
      description: 'Test bridge',
      version: 'test',
    });
    startedServers.push(started);

    const agentCard = await fetch(`${started.baseUrl}/.well-known/agent.json`).then((res) =>
      res.json()
    );
    expect(agentCard.url).toBe(`${started.baseUrl}/a2a`);
    expect(agentCard.skills[0].id).toBe('local-code-execution');

    const result = await postJson(`${started.baseUrl}/a2a`, {
      jsonrpc: '2.0',
      id: 1,
      method: 'message/send',
      params: {
        message: {
          kind: 'message',
          messageId: 'msg-1',
          role: 'user',
          contextId: 'ctx-1',
          parts: [{ kind: 'text', text: 'Say hello' }],
        },
        configuration: {
          blocking: true,
          acceptedOutputModes: ['text'],
        },
      },
    });

    expect(result.result.status.state).toBe('completed');
    expect(result.result.artifacts[0].parts[0].text).toContain('Runner finished');
    expect(mockChildProcessState.spawnCalls[0].command).toBe('node');
    expect(mockChildProcessState.spawnCalls[0].args[2]).toContain('Task:\n\nSay hello');
  });

  it('includes changed files and verification output in a successful write run', async () => {
    const workspace = await makeWorkspace();
    mockChildProcessState.gitStatuses.push('', '?? generated.txt\n');
    mockChildProcessState.spawnBehaviors.push({ stdout: 'done' }, { stdout: 'lint ok' });

    const started = await startCodeNodeServer({
      host: '127.0.0.1',
      port: 0,
      workspaceRoot: workspace,
      runnerCommand: 'node',
      runnerArgs: ['-e', "process.stdout.write('done')"],
      verificationCommand: 'pnpm lint',
      allowWrite: true,
      defaultTimeoutMs: 5_000,
      name: 'Writer Node',
      description: 'Writes files',
      version: 'test',
    });
    startedServers.push(started);

    const result = await postJson(`${started.baseUrl}/a2a`, {
      jsonrpc: '2.0',
      id: 2,
      method: 'message/send',
      params: {
        message: {
          kind: 'message',
          messageId: 'msg-2',
          role: 'user',
          contextId: 'ctx-2',
          parts: [{ kind: 'text', text: 'Create a file' }],
          metadata: { codeNode: { mode: 'write' } },
        },
        configuration: {
          blocking: true,
          acceptedOutputModes: ['text'],
        },
      },
    });

    const dataPart = result.result.artifacts[0].parts.find((part: any) => part.kind === 'data');
    expect(dataPart.data.changedFiles).toEqual(['generated.txt']);
    expect(dataPart.data.verification.command).toBe('pnpm lint');
    expect(dataPart.data.verification.stdout).toContain('lint ok');
    expect(mockChildProcessState.spawnCalls[1].args).toEqual(['-lc', 'pnpm lint']);
  });

  it('rejects workspaces outside the configured root', async () => {
    const workspace = await makeWorkspace();
    const outside = await makeWorkspace();
    mockChildProcessState.gitStatuses.push('', '');

    const started = await startCodeNodeServer({
      host: '127.0.0.1',
      port: 0,
      workspaceRoot: workspace,
      runnerCommand: 'node',
      runnerArgs: ['-e', "process.stdout.write('ok')"],
      allowWrite: false,
      defaultTimeoutMs: 5_000,
      name: 'Guarded Node',
      description: 'Guards workspace',
      version: 'test',
    });
    startedServers.push(started);

    const result = await postJson(`${started.baseUrl}/a2a`, {
      jsonrpc: '2.0',
      id: 3,
      method: 'message/send',
      params: {
        message: {
          kind: 'message',
          messageId: 'msg-3',
          role: 'user',
          contextId: 'ctx-3',
          parts: [{ kind: 'text', text: 'Outside root' }],
          metadata: { codeNode: { workspace: outside } },
        },
        configuration: {
          blocking: true,
          acceptedOutputModes: ['text'],
        },
      },
    });

    expect(result.result.status.state).toBe('failed');
    expect(result.result.status.message.parts[0].text).toContain('Workspace must be within');
    expect(mockChildProcessState.spawnCalls).toHaveLength(0);
  });

  it('supports non-blocking send plus cancel', async () => {
    const workspace = await makeWorkspace();
    mockChildProcessState.gitStatuses.push('', '');
    mockChildProcessState.spawnBehaviors.push({ autoClose: false });

    const started = await startCodeNodeServer({
      host: '127.0.0.1',
      port: 0,
      workspaceRoot: workspace,
      runnerCommand: 'node',
      runnerArgs: ['-e', "setTimeout(() => process.stdout.write('done'), 60000)"],
      allowWrite: false,
      defaultTimeoutMs: 60_000,
      name: 'Cancelable Node',
      description: 'Cancelable run',
      version: 'test',
    });
    startedServers.push(started);

    const startResult = await postJson(`${started.baseUrl}/a2a`, {
      jsonrpc: '2.0',
      id: 4,
      method: 'message/send',
      params: {
        message: {
          kind: 'message',
          messageId: 'msg-4',
          role: 'user',
          contextId: 'ctx-4',
          parts: [{ kind: 'text', text: 'Long task' }],
        },
        configuration: {
          blocking: false,
          acceptedOutputModes: ['text'],
        },
      },
    });

    expect(startResult.result.status.state).toBe('working');
    const taskId = startResult.result.id;

    const cancelResult = await postJson(`${started.baseUrl}/a2a`, {
      jsonrpc: '2.0',
      id: 5,
      method: 'tasks/cancel',
      params: { id: taskId },
    });

    expect(cancelResult.result.status.state).toBe('canceled');
    expect(mockChildProcessState.spawnCalls[0].child.kill).toHaveBeenCalledWith('SIGTERM');

    await new Promise((resolve) => setTimeout(resolve, 0));
    const taskResult = await postJson(`${started.baseUrl}/a2a`, {
      jsonrpc: '2.0',
      id: 6,
      method: 'tasks/get',
      params: { id: taskId },
    });

    expect(taskResult.result.status.state).toBe('canceled');
  });

  it('streams status and artifact events for message/stream', async () => {
    const workspace = await makeWorkspace();
    mockChildProcessState.gitStatuses.push('', '');
    mockChildProcessState.spawnBehaviors.push({ stdout: 'streamed result' });

    const started = await startCodeNodeServer({
      host: '127.0.0.1',
      port: 0,
      workspaceRoot: workspace,
      runnerCommand: 'node',
      runnerArgs: ['-e', "process.stdout.write('streamed result')"],
      allowWrite: false,
      defaultTimeoutMs: 5_000,
      name: 'Streaming Node',
      description: 'Streams progress',
      version: 'test',
    });
    startedServers.push(started);

    const response = await fetch(`${started.baseUrl}/a2a`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 7,
        method: 'message/stream',
        params: {
          message: {
            kind: 'message',
            messageId: 'msg-7',
            role: 'user',
            contextId: 'ctx-7',
            parts: [{ kind: 'text', text: 'Stream this' }],
          },
          configuration: {
            acceptedOutputModes: ['text'],
          },
        },
      }),
    });

    const body = await response.text();

    expect(response.headers.get('content-type')).toContain('text/event-stream');
    expect(body).toContain('"kind":"status-update"');
    expect(body).toContain('"kind":"artifact-update"');
    expect(body).toContain('"state":"completed"');
  });
});
