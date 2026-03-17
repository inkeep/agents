import { type ChildProcessWithoutNullStreams, spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { statSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import path from 'node:path';
import type {
  AgentCard,
  Artifact,
  JSONRPCError,
  JSONRPCErrorResponse,
  JSONRPCRequest,
  Message,
  MessageSendParams,
  Task,
  TaskArtifactUpdateEvent,
  TaskStatusUpdateEvent,
} from '@inkeep/agents-core';
import { TaskState } from '@inkeep/agents-core';

type ExecutionMode = 'read' | 'write';

type CodeNodeRequestMetadata = {
  workspace?: string;
  timeoutMs?: number;
  mode?: ExecutionMode;
  runnerArgs?: string[];
};

type TaskRecord = {
  task: Task;
  child?: ChildProcessWithoutNullStreams;
  completion?: Promise<void>;
  canceled: boolean;
};

export interface CodeNodeServerOptions {
  host: string;
  port: number;
  workspaceRoot: string;
  runnerCommand: string;
  runnerArgs: string[];
  verificationCommand?: string;
  allowWrite: boolean;
  defaultTimeoutMs: number;
  name: string;
  description: string;
  version: string;
}

export interface StartedCodeNodeServer {
  server: Server;
  card: AgentCard;
  baseUrl: string;
  close: () => Promise<void>;
}

const DEFAULT_OUTPUT_MODES = ['text', 'text/plain', 'application/json'];
const MAX_OUTPUT_CHARS = 20_000;

function truncate(text: string): string {
  if (text.length <= MAX_OUTPUT_CHARS) {
    return text;
  }
  return `${text.slice(0, MAX_OUTPUT_CHARS)}\n...truncated`;
}

function getPromptText(message: Message): string {
  return message.parts
    .filter((part): part is { kind: 'text'; text: string } => part.kind === 'text')
    .map((part) => part.text.trim())
    .filter(Boolean)
    .join('\n\n');
}

function getMetadata(params: MessageSendParams): CodeNodeRequestMetadata {
  const paramMetadata = (params.metadata?.codeNode ?? {}) as CodeNodeRequestMetadata;
  const messageMetadata = (params.message.metadata?.codeNode ?? {}) as CodeNodeRequestMetadata;

  return {
    ...paramMetadata,
    ...messageMetadata,
  };
}

function resolveWorkspace(workspaceRoot: string, requestedWorkspace?: string): string {
  const root = path.resolve(workspaceRoot);
  const resolved = requestedWorkspace
    ? path.resolve(
        path.isAbsolute(requestedWorkspace)
          ? requestedWorkspace
          : path.join(root, requestedWorkspace)
      )
    : root;

  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error(`Workspace must be within ${root}`);
  }

  const stats = statSync(resolved, { throwIfNoEntry: false });
  if (!stats || !stats.isDirectory()) {
    throw new Error(`Workspace does not exist or is not a directory: ${resolved}`);
  }

  return resolved;
}

function replaceTemplate(arg: string, prompt: string, workspace: string): string {
  return arg.replaceAll('{prompt}', prompt).replaceAll('{workspace}', workspace);
}

function buildPrompt(prompt: string, workspace: string, mode: ExecutionMode): string {
  const modeInstruction =
    mode === 'write'
      ? 'You may modify files in the current working directory if the task requires it.'
      : 'Read-only mode. Do not modify files or create new files.';

  return [
    'You are running as a local coding-agent node for Inkeep.',
    `Current working directory: ${workspace}`,
    modeInstruction,
    'Respond with the work result directly.',
    'Task:',
    prompt,
  ].join('\n\n');
}

function snapshotGitStatus(workspace: string): Map<string, string> {
  const result = spawnSync('git', ['-C', workspace, 'status', '--porcelain=v1'], {
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    return new Map();
  }

  return new Map(
    result.stdout
      .split('\n')
      .map((line) => line.trimEnd())
      .filter(Boolean)
      .map((line) => [line.slice(3), line.slice(0, 2)])
  );
}

function diffGitStatus(before: Map<string, string>, after: Map<string, string>): string[] {
  const paths = new Set([...before.keys(), ...after.keys()]);
  return [...paths].filter((filePath) => before.get(filePath) !== after.get(filePath)).sort();
}

function createTask(taskId: string, contextId: string): Task {
  return {
    id: taskId,
    kind: 'task',
    contextId,
    status: {
      state: TaskState.Submitted,
      timestamp: new Date().toISOString(),
    },
    artifacts: [],
    history: [],
    metadata: {},
  };
}

function createStatusMessage(taskId: string, contextId: string, text: string): Message {
  return {
    kind: 'message',
    messageId: randomUUID(),
    role: 'agent',
    taskId,
    contextId,
    parts: [{ kind: 'text', text }],
  };
}

function setTaskState(task: Task, state: TaskState, text?: string): TaskStatusUpdateEvent {
  task.status = {
    state,
    timestamp: new Date().toISOString(),
    message: text ? createStatusMessage(task.id, task.contextId, text) : task.status.message,
  };

  return {
    kind: 'status-update',
    taskId: task.id,
    contextId: task.contextId,
    status: task.status,
    final: isTerminalState(state),
  };
}

function isTerminalState(state: TaskState): boolean {
  return [TaskState.Completed, TaskState.Canceled, TaskState.Failed, TaskState.Rejected].includes(
    state
  );
}

function createArtifact(
  task: Task,
  summaryText: string,
  data: Record<string, unknown>
): TaskArtifactUpdateEvent {
  const artifact: Artifact = {
    artifactId: randomUUID(),
    taskId: task.id,
    createdAt: new Date().toISOString(),
    name: 'code-node-result',
    description: 'Result from local code-node execution',
    type: 'source',
    parts: [
      { kind: 'text', text: summaryText },
      { kind: 'data', data },
    ],
  };

  task.artifacts = [...(task.artifacts ?? []), artifact];

  return {
    kind: 'artifact-update',
    taskId: task.id,
    contextId: task.contextId,
    artifact,
    append: false,
    lastChunk: true,
  };
}

function jsonRpcError(
  id: JSONRPCRequest['id'],
  code: number,
  message: string
): JSONRPCErrorResponse {
  const error: JSONRPCError = { code, message };
  return {
    jsonrpc: '2.0',
    id,
    error,
  };
}

async function readBody(request: IncomingMessage): Promise<string> {
  return await new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });
}

function writeJson(response: ServerResponse, statusCode: number, body: unknown): void {
  response.writeHead(statusCode, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(body));
}

function writeSsePayload(response: ServerResponse, payload: unknown): void {
  response.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function writeSse(response: ServerResponse, id: JSONRPCRequest['id'], result: unknown): void {
  writeSsePayload(response, { jsonrpc: '2.0', id, result });
}

async function runCommand(
  command: string,
  args: string[],
  prompt: string | undefined,
  cwd: string,
  timeoutMs: number
): Promise<{ stdout: string; stderr: string; exitCode: number | null; signal: string | null }> {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: process.env,
      stdio: 'pipe',
    });

    let stdout = '';
    let stderr = '';
    const timeout = setTimeout(() => {
      terminateChild(child);
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on('close', (exitCode, signal) => {
      clearTimeout(timeout);
      resolve({ stdout, stderr, exitCode, signal });
    });

    if (prompt !== undefined) {
      child.stdin.write(prompt);
    }
    child.stdin.end();
  });
}

function buildRunnerInvocation(
  runnerArgs: string[],
  prompt: string,
  workspace: string
): { args: string[]; stdinPrompt?: string } {
  const usesPromptPlaceholder = runnerArgs.some((arg) => arg.includes('{prompt}'));
  return {
    args: runnerArgs.map((arg) => replaceTemplate(arg, prompt, workspace)),
    stdinPrompt: usesPromptPlaceholder ? undefined : prompt,
  };
}

function terminateChild(
  child: ChildProcessWithoutNullStreams | undefined,
  signal: NodeJS.Signals = 'SIGTERM'
): void {
  if (!child || child.killed) {
    return;
  }

  child.kill(signal);

  if (signal !== 'SIGKILL') {
    setTimeout(() => {
      if (!child.killed) {
        child.kill('SIGKILL');
      }
    }, 2000).unref();
  }
}

async function runTask(
  record: TaskRecord,
  params: MessageSendParams,
  options: CodeNodeServerOptions,
  events?: {
    onStatus?: (event: TaskStatusUpdateEvent) => void;
    onArtifact?: (event: TaskArtifactUpdateEvent) => void;
  }
): Promise<void> {
  const metadata = getMetadata(params);
  const workspace = resolveWorkspace(options.workspaceRoot, metadata.workspace);
  const mode = metadata.mode ?? (options.allowWrite ? 'write' : 'read');

  if (mode === 'write' && !options.allowWrite) {
    throw new Error('Write mode requested, but this node was started without write access');
  }

  const timeoutMs = metadata.timeoutMs ?? options.defaultTimeoutMs;
  const beforeStatus = snapshotGitStatus(workspace);
  const rawPrompt = getPromptText(params.message);
  const prompt = buildPrompt(rawPrompt, workspace, mode);
  const runnerArgs = metadata.runnerArgs?.length ? metadata.runnerArgs : options.runnerArgs;
  const { args, stdinPrompt } = buildRunnerInvocation(runnerArgs, prompt, workspace);

  const workingEvent = setTaskState(record.task, TaskState.Working, 'Running coding agent');
  events?.onStatus?.(workingEvent);

  const child = spawn(options.runnerCommand, args, {
    cwd: workspace,
    env: process.env,
    stdio: 'pipe',
  });
  record.child = child;

  let stdout = '';
  let stderr = '';
  const timeout = setTimeout(() => {
    record.canceled = true;
    terminateChild(child);
  }, timeoutMs);

  child.stdout.on('data', (chunk) => {
    stdout += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  if (stdinPrompt !== undefined) {
    child.stdin.write(stdinPrompt);
  }
  child.stdin.end();

  const result = await new Promise<{ exitCode: number | null; signal: string | null }>(
    (resolve, reject) => {
      child.on('error', reject);
      child.on('close', (exitCode, signal) => resolve({ exitCode, signal }));
    }
  ).finally(() => {
    clearTimeout(timeout);
    record.child = undefined;
  });

  const afterStatus = snapshotGitStatus(workspace);
  const changedFiles = diffGitStatus(beforeStatus, afterStatus);

  let verification:
    | {
        command: string;
        stdout: string;
        stderr: string;
        exitCode: number | null;
        signal: string | null;
      }
    | undefined;

  if (!record.canceled && options.verificationCommand) {
    verification = {
      command: options.verificationCommand,
      ...(await runCommand(
        process.env.SHELL || 'zsh',
        ['-lc', options.verificationCommand],
        undefined,
        workspace,
        timeoutMs
      )),
    };
  }

  const summaryText = truncate(
    stdout.trim() || stderr.trim() || 'Execution finished with no output.'
  );
  const artifactEvent = createArtifact(record.task, summaryText, {
    runnerCommand: options.runnerCommand,
    runnerArgs: args,
    workspace,
    mode,
    exitCode: result.exitCode,
    signal: result.signal,
    stdout: truncate(stdout),
    stderr: truncate(stderr),
    changedFiles,
    verification: verification
      ? {
          command: options.verificationCommand,
          stdout: truncate(verification.stdout),
          stderr: truncate(verification.stderr),
          exitCode: verification.exitCode,
          signal: verification.signal,
        }
      : null,
  });
  events?.onArtifact?.(artifactEvent);

  if (record.canceled) {
    const canceledEvent = setTaskState(record.task, TaskState.Canceled, 'Execution canceled');
    events?.onStatus?.(canceledEvent);
    return;
  }

  const verificationFailed =
    verification !== undefined && verification.exitCode !== 0 && verification.signal === null;
  const executionFailed = result.exitCode !== 0 || result.signal !== null;

  if (executionFailed || verificationFailed) {
    const failedEvent = setTaskState(record.task, TaskState.Failed, 'Execution failed');
    events?.onStatus?.(failedEvent);
    return;
  }

  const completedEvent = setTaskState(record.task, TaskState.Completed, 'Execution completed');
  events?.onStatus?.(completedEvent);
}

export async function startCodeNodeServer(
  options: CodeNodeServerOptions
): Promise<StartedCodeNodeServer> {
  const taskRecords = new Map<string, TaskRecord>();
  const baseCard: Omit<AgentCard, 'url'> = {
    name: options.name,
    description: options.description,
    version: options.version,
    capabilities: {
      streaming: true,
    },
    defaultInputModes: ['text'],
    defaultOutputModes: DEFAULT_OUTPUT_MODES,
    skills: [
      {
        id: 'local-code-execution',
        name: options.name,
        description: options.description,
        tags: ['local-dev', 'code', options.allowWrite ? 'write' : 'read-only'],
      },
    ],
  };

  const server = createServer(async (request, response) => {
    const requestUrl = new URL(
      request.url ?? '/',
      `http://${options.host}:${resolvedPort(server, options.port)}`
    );

    if (request.method === 'GET' && requestUrl.pathname === '/health') {
      writeJson(response, 200, { ok: true });
      return;
    }

    if (request.method === 'GET' && requestUrl.pathname === '/.well-known/agent.json') {
      writeJson(response, 200, {
        ...baseCard,
        url: `http://${options.host}:${resolvedPort(server, options.port)}/a2a`,
      } satisfies AgentCard);
      return;
    }

    if (request.method !== 'POST' || requestUrl.pathname !== '/a2a') {
      writeJson(response, 404, { error: 'Not found' });
      return;
    }

    let parsed: JSONRPCRequest;
    try {
      parsed = JSON.parse(await readBody(request)) as JSONRPCRequest;
    } catch {
      writeJson(response, 400, jsonRpcError(null, -32700, 'Invalid JSON payload'));
      return;
    }

    if (parsed.jsonrpc !== '2.0' || typeof parsed.method !== 'string') {
      writeJson(response, 400, jsonRpcError(parsed.id, -32600, 'Invalid JSON-RPC request'));
      return;
    }

    try {
      if (parsed.method === 'tasks/get') {
        const taskId = parsed.params?.id as string | undefined;
        const record = taskId ? taskRecords.get(taskId) : undefined;
        if (!record) {
          writeJson(response, 404, jsonRpcError(parsed.id, -32001, `Task not found: ${taskId}`));
          return;
        }
        writeJson(response, 200, { jsonrpc: '2.0', id: parsed.id, result: record.task });
        return;
      }

      if (parsed.method === 'tasks/cancel') {
        const taskId = parsed.params?.id as string | undefined;
        const record = taskId ? taskRecords.get(taskId) : undefined;
        if (!record) {
          writeJson(response, 404, jsonRpcError(parsed.id, -32001, `Task not found: ${taskId}`));
          return;
        }
        if (isTerminalState(record.task.status.state)) {
          writeJson(response, 200, { jsonrpc: '2.0', id: parsed.id, result: record.task });
          return;
        }
        record.canceled = true;
        terminateChild(record.child);
        setTaskState(record.task, TaskState.Canceled, 'Execution canceled');
        writeJson(response, 200, { jsonrpc: '2.0', id: parsed.id, result: record.task });
        return;
      }

      if (parsed.method !== 'message/send' && parsed.method !== 'message/stream') {
        writeJson(
          response,
          404,
          jsonRpcError(parsed.id, -32601, `Unsupported method: ${parsed.method}`)
        );
        return;
      }

      const params = parsed.params as MessageSendParams;
      const contextId = params.message.contextId || randomUUID();
      const taskId = randomUUID();
      const record: TaskRecord = {
        task: createTask(taskId, contextId),
        canceled: false,
      };
      taskRecords.set(taskId, record);

      const onTaskError = (error: unknown) => {
        setTaskState(
          record.task,
          TaskState.Failed,
          error instanceof Error ? error.message : 'Execution failed'
        );
      };

      if (parsed.method === 'message/stream') {
        response.writeHead(200, {
          'Content-Type': 'text/event-stream',
          Connection: 'keep-alive',
          'Cache-Control': 'no-cache',
        });
        response.write(': keep-alive\n\n');

        record.completion = runTask(record, params, options, {
          onStatus: (event) => writeSse(response, parsed.id, event),
          onArtifact: (event) => writeSse(response, parsed.id, event),
        })
          .catch((error) => {
            onTaskError(error);
            writeSsePayload(
              response,
              jsonRpcError(
                parsed.id,
                -32603,
                error instanceof Error ? error.message : 'Execution failed'
              )
            );
          })
          .finally(() => {
            response.end();
          });
        return;
      }

      const blocking = params.configuration?.blocking !== false;
      record.completion = runTask(record, params, options).catch((error) => {
        onTaskError(error);
      });

      if (!blocking) {
        setTaskState(record.task, TaskState.Working, 'Execution started');
        writeJson(response, 200, { jsonrpc: '2.0', id: parsed.id, result: record.task });
        return;
      }

      await record.completion;
      writeJson(response, 200, { jsonrpc: '2.0', id: parsed.id, result: record.task });
    } catch (error) {
      writeJson(
        response,
        500,
        jsonRpcError(
          parsed.id,
          -32603,
          error instanceof Error ? error.message : 'Internal server error'
        )
      );
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port, options.host, () => {
      server.off('error', reject);
      resolve();
    });
  });

  return {
    server,
    card: {
      ...baseCard,
      url: `http://${options.host}:${resolvedPort(server, options.port)}/a2a`,
    },
    baseUrl: `http://${options.host}:${resolvedPort(server, options.port)}`,
    close: async () => {
      const closeServer = new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });

      for (const record of taskRecords.values()) {
        record.canceled = true;
        terminateChild(record.child);
      }

      server.closeAllConnections?.();

      await Promise.allSettled(
        [...taskRecords.values()]
          .map((record) => record.completion)
          .filter((completion): completion is Promise<void> => completion !== undefined)
      );

      await closeServer;
    },
  };
}

function resolvedPort(server: Server, fallbackPort: number): number {
  const address = server.address();
  if (!address || typeof address === 'string') {
    return fallbackPort;
  }
  return address.port;
}
