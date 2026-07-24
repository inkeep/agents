import crypto from 'node:crypto';
import { type Session, TenkiSandbox } from '@tenkicloud/sandbox';
import { getLogger } from '../../../logger';
import {
  FUNCTION_TOOL_SANDBOX_CLEANUP_INTERVAL_MS,
  FUNCTION_TOOL_SANDBOX_MAX_OUTPUT_SIZE_BYTES,
  FUNCTION_TOOL_SANDBOX_MAX_USE_COUNT,
  FUNCTION_TOOL_SANDBOX_POOL_TTL_MS,
} from '../constants/execution-limits';
import type { TenkiSandboxConfig } from '../types/executionContext';
import type { FunctionToolConfig } from './NativeSandboxExecutor';
import { createExecutionWrapper, parseExecutionResult } from './sandbox-utils';
import type { ExecutionResult } from './VercelSandboxExecutor';

const logger = getLogger('TenkiSandboxExecutor');

const TENKI_GUEST_WORKDIR = '/home/tenki';
const DEFAULT_EXEC_TIMEOUT_MS = 60_000;
const SESSION_LIFETIME_BUFFER_MS = 10_000;
const KILL_GRACE_PERIOD_MS = 5_000;
const SESSION_READY_TIMEOUT_MS = 180_000;

const decoder = new TextDecoder();

class CommandTimeoutError extends Error {}

class CommandOutputLimitError extends Error {}

interface CommandResult {
  exitCode: number;
  stdout: Uint8Array;
  stderr: Uint8Array;
}

interface CachedSandbox {
  session: Session;
  createdAt: number;
  expiresAt: number;
  useCount: number;
  activeCount: number;
  dependencies: Record<string, string>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function concatChunks(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((size, chunk) => size + chunk.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

/**
 * Tenki Sandbox Executor with pooling/reuse
 * Executes function tools in isolated Tenki Sandbox microVMs
 * Caches and reuses sandbox sessions based on dependencies to improve performance
 */
export class TenkiSandboxExecutor {
  private config: TenkiSandboxConfig;
  private client: TenkiSandbox;
  private sandboxPool: Map<string, CachedSandbox> = new Map();
  private retiredSandboxes: Set<CachedSandbox> = new Set();
  private pendingCloses: Set<Promise<void>> = new Set();
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;
  private sandboxInitPromises: Map<string, Promise<Session>> = new Map();
  private resolvedProjectId: string | undefined;
  private shuttingDown = false;

  public constructor(config: TenkiSandboxConfig) {
    this.config = config;
    this.client = new TenkiSandbox({
      ...(config.authToken !== undefined ? { authToken: config.authToken } : {}),
      ...(config.baseUrl !== undefined ? { baseUrl: config.baseUrl } : {}),
    });
    logger.info(
      {
        baseUrl: config.baseUrl,
        projectId: config.projectId,
        runtime: config.runtime,
        timeout: config.timeout,
        vcpus: config.vcpus,
      },
      'TenkiSandboxExecutor initialized with pooling'
    );
    this.startPoolCleanup();
  }

  /**
   * Per-command execution budget
   */
  private get execTimeoutMs(): number {
    return this.config.timeout ?? DEFAULT_EXEC_TIMEOUT_MS;
  }

  /**
   * Session lifetime covers the full pool TTL plus one execution budget, so a
   * session handed out at any point within the pool TTL still has at least a
   * full command timeout of life remaining.
   */
  private get sessionLifetimeMs(): number {
    return FUNCTION_TOOL_SANDBOX_POOL_TTL_MS + this.execTimeoutMs + SESSION_LIFETIME_BUFFER_MS;
  }

  /**
   * Run a command in the sandbox with a client-side timeout and output cap.
   * The SDK's Session.exec() does not enforce timeoutMs in 0.3.x and kill()
   * only enqueues the signal, so both limits are enforced here: on timeout or
   * output overflow the process is killed, termination is awaited for a
   * bounded grace period, and the call rejects with a typed error. Output is
   * consumed incrementally from the process streams so an untrusted tool
   * cannot buffer unbounded stdout/stderr into API memory.
   */
  private async runCommand(
    session: Session,
    argv: string[],
    options?: { env?: Record<string, string> }
  ): Promise<CommandResult> {
    const handle = session.run(argv, options?.env !== undefined ? { env: options.env } : {});
    const timeoutMs = this.execTimeoutMs;

    const stdoutChunks: Uint8Array[] = [];
    const stderrChunks: Uint8Array[] = [];
    let totalBytes = 0;
    let overflow = false;

    const readCapped = async (
      stream: ReadableStream<Uint8Array>,
      sink: Uint8Array[]
    ): Promise<void> => {
      const reader = stream.getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done || value === undefined) break;
          totalBytes += value.byteLength;
          if (totalBytes > FUNCTION_TOOL_SANDBOX_MAX_OUTPUT_SIZE_BYTES) {
            overflow = true;
            try {
              await handle.kill();
            } catch {
              // ignore
            }
            break;
          }
          sink.push(value);
        }
      } catch {
        // stream failures surface through the process result
      } finally {
        reader.releaseLock();
      }
    };

    const consumed = Promise.all([
      readCapped(handle.stdout, stdoutChunks),
      readCapped(handle.stderr, stderrChunks),
    ]);

    const result = await new Promise<{ exitCode: number }>((resolve, reject) => {
      let expired = false;
      const timer = setTimeout(async () => {
        expired = true;
        try {
          await handle.kill();
        } catch {
          // ignore
        }
        await Promise.race([
          Promise.resolve(handle).then(
            () => {},
            () => {}
          ),
          sleep(Math.min(KILL_GRACE_PERIOD_MS, timeoutMs)),
        ]);
        reject(new CommandTimeoutError(`Command timed out after ${timeoutMs}ms: ${argv[0]}`));
      }, timeoutMs);

      Promise.resolve(handle).then(
        (value) => {
          if (!expired) {
            clearTimeout(timer);
            resolve(value);
          }
        },
        (error) => {
          if (!expired) {
            clearTimeout(timer);
            reject(error);
          }
        }
      );
    });

    await Promise.race([consumed, sleep(KILL_GRACE_PERIOD_MS)]);

    if (overflow) {
      throw new CommandOutputLimitError(
        `Output size exceeded limit of ${FUNCTION_TOOL_SANDBOX_MAX_OUTPUT_SIZE_BYTES} bytes: ${argv[0]}`
      );
    }

    return {
      exitCode: result.exitCode,
      stdout: concatChunks(stdoutChunks),
      stderr: concatChunks(stderrChunks),
    };
  }

  private async getOrCreateSandbox(params: {
    functionId: string;
    toolName?: string;
    dependencyHash: string;
    dependencies: Record<string, string>;
  }): Promise<Session> {
    const cached = this.acquireCachedSandbox(params.dependencyHash);
    if (cached) return cached;

    const existingInit = this.sandboxInitPromises.get(params.dependencyHash);
    if (existingInit) {
      await existingInit;
      const afterInit = this.acquireCachedSandbox(params.dependencyHash);
      if (!afterInit) {
        throw new Error('Sandbox initialization finished but sandbox not found in pool');
      }
      return afterInit;
    }

    const initPromise = (async (): Promise<Session> => {
      let session: Session | null = null;
      try {
        const projectId = await this.resolveProjectId();
        // waitReady: false so the session handle is captured before readiness;
        // if the VM comes up but never turns ready, the catch below can still
        // close it instead of leaking a running cloud session
        session = await this.client.create({
          name: `inkeep-fn-${params.dependencyHash}`,
          cpuCores: this.config.vcpus || 1,
          allowOutbound: true,
          maxDurationMs: this.sessionLifetimeMs,
          waitReady: false,
          ...(projectId !== undefined ? { projectId } : {}),
        });
        await session.waitReady(SESSION_READY_TIMEOUT_MS);

        logger.info(
          {
            functionId: params.functionId,
            functionName: params.toolName,
            sandboxId: session.id,
            dependencyHash: params.dependencyHash,
          },
          'New sandbox created'
        );

        if (this.config.runtime === 'node22') {
          const versionResult = await this.runCommand(session, ['node', '--version']);
          const nodeVersion = decoder.decode(versionResult.stdout).trim();
          if (!nodeVersion.startsWith('v22.')) {
            logger.warn(
              { nodeVersion, configuredRuntime: this.config.runtime },
              'Guest Node.js version does not match the configured runtime; the Tenki base image controls the Node version — use a custom image to pin it'
            );
          }
        }

        if (Object.keys(params.dependencies).length > 0) {
          logger.debug(
            {
              functionId: params.functionId,
              functionName: params.toolName,
              dependencyHash: params.dependencyHash,
              dependencies: params.dependencies,
            },
            'Installing dependencies in new sandbox'
          );

          const packageJsonContent = JSON.stringify({ dependencies: params.dependencies }, null, 2);
          await session.writeFile(`${TENKI_GUEST_WORKDIR}/package.json`, packageJsonContent);

          const installResult = await this.runCommand(session, ['npm', 'install', '--omit=dev']);

          const installStdout = decoder.decode(installResult.stdout);
          const installStderr = decoder.decode(installResult.stderr);
          if (installStdout) logger.debug({ functionId: params.functionId }, installStdout);
          if (installStderr) logger.debug({ functionId: params.functionId }, installStderr);

          if (installResult.exitCode !== 0) {
            throw new Error(`Failed to install dependencies: ${installStderr}`);
          }

          logger.info(
            {
              functionId: params.functionId,
              dependencyHash: params.dependencyHash,
            },
            'Dependencies installed successfully'
          );
        }

        if (this.shuttingDown) {
          throw new Error('Executor shut down during sandbox initialization');
        }

        this.addToPool(params.dependencyHash, session, params.dependencies);

        return session;
      } catch (error) {
        if (session) {
          try {
            await session.close();
          } catch {
            // ignore
          }
        }
        throw error;
      } finally {
        this.sandboxInitPromises.delete(params.dependencyHash);
      }
    })();

    this.sandboxInitPromises.set(params.dependencyHash, initPromise);
    await initPromise;

    const created = this.acquireCachedSandbox(params.dependencyHash);
    if (!created) {
      throw new Error(
        'Sandbox expired before first use; initialization consumed its remaining lifetime'
      );
    }
    return created;
  }

  /**
   * Resolve the Tenki project to create sandboxes in.
   * Uses the configured projectId, otherwise auto-discovers it via whoAmI()
   * (mirroring the Tenki CLI's project auto-selection).
   */
  private async resolveProjectId(): Promise<string | undefined> {
    if (this.config.projectId) return this.config.projectId;
    if (this.resolvedProjectId) return this.resolvedProjectId;

    const identity = await this.client.whoAmI();
    const projects = identity.workspaces.flatMap((workspace) => workspace.projects);
    const project = projects[0];
    if (!project) return undefined;
    if (projects.length > 1) {
      throw new Error(
        'Multiple Tenki projects are accessible with this token; set projectId in the Tenki sandbox configuration'
      );
    }

    this.resolvedProjectId = project.id;
    logger.info({ projectId: project.id }, 'Auto-selected Tenki project');
    return this.resolvedProjectId;
  }

  /**
   * Generate a hash for dependencies to use as cache key
   */
  private generateDependencyHash(dependencies: Record<string, string>): string {
    const sorted = Object.keys(dependencies)
      .sort()
      .map((key) => `${key}@${dependencies[key]}`)
      .join(',');
    return crypto.createHash('md5').update(sorted).digest('hex').substring(0, 8);
  }

  /**
   * Lease a cached sandbox if one is available, still valid, and holding at
   * least a full command timeout of remaining lifetime. Incrementing the
   * lease counters here (synchronously with the pool lookup) guarantees the
   * cleanup interval can never close a session between lookup and lease.
   */
  private acquireCachedSandbox(dependencyHash: string): Session | null {
    const cached = this.sandboxPool.get(dependencyHash);
    if (!cached) return null;

    const now = Date.now();
    const age = now - cached.createdAt;
    const requiredRemainingMs = this.execTimeoutMs + SESSION_LIFETIME_BUFFER_MS / 2;
    const timeRemaining = cached.expiresAt - now;

    if (
      age > FUNCTION_TOOL_SANDBOX_POOL_TTL_MS ||
      cached.useCount >= FUNCTION_TOOL_SANDBOX_MAX_USE_COUNT ||
      timeRemaining <= requiredRemainingMs
    ) {
      logger.debug(
        {
          dependencyHash,
          age,
          useCount: cached.useCount,
          ttl: FUNCTION_TOOL_SANDBOX_POOL_TTL_MS,
          maxUseCount: FUNCTION_TOOL_SANDBOX_MAX_USE_COUNT,
          expiresAt: cached.expiresAt,
          timeRemaining,
          requiredRemainingMs,
        },
        'Sandbox expired, will create new one'
      );
      this.retireSandbox(dependencyHash);
      return null;
    }

    cached.useCount++;
    cached.activeCount++;

    logger.debug(
      {
        dependencyHash,
        useCount: cached.useCount,
        activeCount: cached.activeCount,
        age,
        expiresAt: cached.expiresAt,
        timeRemaining,
      },
      'Reusing cached sandbox'
    );

    return cached.session;
  }

  /**
   * Release a lease taken by acquireCachedSandbox. Closes a retired sandbox
   * once its last active lease finishes.
   */
  private release(dependencyHash: string, session: Session): void {
    const cached = this.sandboxPool.get(dependencyHash);
    if (cached && cached.session === session) {
      cached.activeCount = Math.max(0, cached.activeCount - 1);
      return;
    }

    for (const retired of this.retiredSandboxes) {
      if (retired.session === session) {
        retired.activeCount = Math.max(0, retired.activeCount - 1);
        if (retired.activeCount === 0) {
          this.retiredSandboxes.delete(retired);
          this.trackClose(retired.session, dependencyHash);
        }
        return;
      }
    }
  }

  /**
   * Retire a sandbox from new use. The session is closed immediately when
   * idle, otherwise deferred until its last active lease is released. When a
   * session is given, the pool entry is only removed if it holds that exact
   * session — an entry replaced under the same dependency hash is left alone.
   */
  private retireSandbox(dependencyHash: string, session?: Session): void {
    const cached = this.sandboxPool.get(dependencyHash);
    if (!cached) return;
    if (session !== undefined && cached.session !== session) return;

    this.sandboxPool.delete(dependencyHash);
    if (cached.activeCount === 0) {
      this.trackClose(cached.session, dependencyHash);
    } else {
      this.retiredSandboxes.add(cached);
      logger.debug(
        { dependencyHash, activeCount: cached.activeCount },
        'Sandbox retired; close deferred until active executions finish'
      );
    }
  }

  private async closeSession(session: Session, dependencyHash: string): Promise<void> {
    try {
      await session.close();
      logger.debug({ dependencyHash }, 'Sandbox closed');
    } catch (error) {
      logger.warn({ error, dependencyHash }, 'Error closing sandbox');
    }
  }

  /**
   * Start a close without blocking the caller while keeping it visible to
   * cleanup(), which awaits every tracked close before returning.
   */
  private trackClose(session: Session, dependencyHash: string): void {
    const closing = this.closeSession(session, dependencyHash);
    this.pendingCloses.add(closing);
    void closing.finally(() => this.pendingCloses.delete(closing));
  }

  /**
   * Add sandbox to pool. The expiry deadline comes from the session's actual
   * timeoutAt — the server starts the maxDurationMs clock at creation, so
   * cold-start and dependency-install time have already consumed lifetime.
   */
  private addToPool(
    dependencyHash: string,
    session: Session,
    dependencies: Record<string, string>
  ): void {
    const expiresAt =
      session.timeoutAt instanceof Date
        ? session.timeoutAt.getTime()
        : Date.now() + this.sessionLifetimeMs;
    this.sandboxPool.set(dependencyHash, {
      session,
      createdAt: Date.now(),
      expiresAt,
      useCount: 0,
      activeCount: 0,
      dependencies,
    });

    logger.debug(
      {
        dependencyHash,
        poolSize: this.sandboxPool.size,
      },
      'Sandbox added to pool'
    );
  }

  /**
   * Start periodic cleanup of expired sandboxes
   */
  private startPoolCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      const toRetire: string[] = [];
      const requiredRemainingMs = this.execTimeoutMs + SESSION_LIFETIME_BUFFER_MS / 2;

      for (const [hash, cached] of this.sandboxPool.entries()) {
        const age = now - cached.createdAt;
        const timeRemaining = cached.expiresAt - now;
        if (
          age > FUNCTION_TOOL_SANDBOX_POOL_TTL_MS ||
          cached.useCount >= FUNCTION_TOOL_SANDBOX_MAX_USE_COUNT ||
          timeRemaining <= requiredRemainingMs
        ) {
          toRetire.push(hash);
        }
      }

      if (toRetire.length > 0) {
        logger.info(
          {
            count: toRetire.length,
            poolSize: this.sandboxPool.size,
          },
          'Retiring expired sandboxes'
        );

        for (const hash of toRetire) {
          this.retireSandbox(hash);
        }
      }
    }, FUNCTION_TOOL_SANDBOX_CLEANUP_INTERVAL_MS);
  }

  /**
   * Cleanup all sandboxes and stop cleanup interval
   */
  public async cleanup(): Promise<void> {
    this.shuttingDown = true;

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    logger.info(
      {
        poolSize: this.sandboxPool.size,
        retiredCount: this.retiredSandboxes.size,
        pendingInits: this.sandboxInitPromises.size,
      },
      'Cleaning up all sandboxes'
    );

    const pendingInits = Array.from(this.sandboxInitPromises.values());
    this.sandboxInitPromises.clear();
    await Promise.allSettled(pendingInits);

    const pooled = Array.from(this.sandboxPool.entries());
    this.sandboxPool.clear();
    const retired = Array.from(this.retiredSandboxes);
    this.retiredSandboxes.clear();

    await Promise.all([
      ...pooled.map(([hash, cached]) => this.closeSession(cached.session, hash)),
      ...retired.map((cached) => this.closeSession(cached.session, 'retired')),
    ]);

    while (this.pendingCloses.size > 0) {
      await Promise.all(Array.from(this.pendingCloses));
    }
  }

  /**
   * Extract environment variable names from code
   * Matches patterns like process.env.VAR_NAME or process.env['VAR_NAME']
   */
  private extractEnvVars(code: string): Set<string> {
    const envVars = new Set<string>();

    const dotNotationRegex = /process\.env\.([A-Z_][A-Z0-9_]*)/g;
    let match = dotNotationRegex.exec(code);
    while (match !== null) {
      envVars.add(match[1]);
      match = dotNotationRegex.exec(code);
    }

    const bracketNotationRegex = /process\.env\[['"]([A-Z_][A-Z0-9_]*)['"]\]/g;
    match = bracketNotationRegex.exec(code);
    while (match !== null) {
      envVars.add(match[1]);
      match = bracketNotationRegex.exec(code);
    }

    return envVars;
  }

  /**
   * Execute a function tool in Tenki Sandbox with pooling
   */
  public async executeFunctionTool(
    functionId: string,
    args: Record<string, unknown>,
    toolConfig: FunctionToolConfig
  ): Promise<ExecutionResult> {
    const startTime = Date.now();
    const logs: string[] = [];
    const dependencies = toolConfig.dependencies || {};
    const dependencyHash = this.generateDependencyHash(dependencies);
    const runId = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
    const runDir = `${TENKI_GUEST_WORKDIR}/runs/${runId}`;
    const filename = this.config.runtime === 'typescript' ? 'execute.ts' : 'execute.js';

    let session: Session | null = null;

    try {
      logger.info(
        {
          functionId,
          functionName: toolConfig.name,
          dependencyHash,
          poolSize: this.sandboxPool.size,
        },
        'Executing function in Tenki Sandbox'
      );

      session = await this.getOrCreateSandbox({
        functionId,
        toolName: toolConfig.name,
        dependencyHash,
        dependencies,
      });

      let cleanupRunDir = false;
      try {
        const executionCode = createExecutionWrapper(toolConfig.executeCode, args);
        const envVars = this.extractEnvVars(toolConfig.executeCode);
        const env =
          envVars.size > 0 ? Object.fromEntries(Array.from(envVars).map((k) => [k, ''])) : {};

        const mkdirResult = await this.runCommand(session, ['mkdir', '-p', runDir]);
        if (mkdirResult.exitCode !== 0) {
          throw new Error(decoder.decode(mkdirResult.stderr) || 'Failed to create run directory');
        }
        cleanupRunDir = true;

        const runFilePath = `${runDir}/${filename}`;
        await session.writeFile(runFilePath, executionCode);

        const argv =
          this.config.runtime === 'typescript'
            ? ['npx', '--yes', 'tsx', runFilePath]
            : ['node', runFilePath];

        let executeResult: CommandResult;
        try {
          executeResult = await this.runCommand(session, argv, { env });
        } catch (error) {
          cleanupRunDir = false;
          throw error;
        }

        const executeStdout = decoder.decode(executeResult.stdout);
        const executeStderr = decoder.decode(executeResult.stderr);

        if (executeStdout) logs.push(executeStdout);
        if (executeStderr) logs.push(executeStderr);

        const executionTime = Date.now() - startTime;

        if (executeResult.exitCode !== 0) {
          logger.error(
            {
              functionId,
              exitCode: executeResult.exitCode,
              stderr: executeStderr,
              logs,
            },
            'Function execution failed'
          );

          return {
            success: false,
            error: executeStderr || 'Function execution failed with non-zero exit code',
            logs,
            executionTime,
          };
        }

        const parsed = parseExecutionResult(executeStdout, functionId, logger);
        let result: unknown = parsed;
        if (typeof parsed === 'object' && parsed !== null && 'success' in parsed) {
          const wrapper = parsed as { success: boolean; result?: unknown; error?: string };
          if (!wrapper.success) {
            return {
              success: false,
              error: wrapper.error || 'Function execution failed',
              logs,
              executionTime,
            };
          }
          result = wrapper.result;
        }

        logger.info(
          {
            functionId,
            executionTime,
            logs,
          },
          'Function executed successfully in Tenki Sandbox'
        );

        return {
          success: true,
          result,
          logs,
          executionTime,
        };
      } finally {
        if (cleanupRunDir) {
          try {
            await this.runCommand(session, ['rm', '-rf', runDir]);
          } catch {
            // ignore
          }
        }
      }
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Any exception after a session is leased is infrastructure-shaped
      // (timeout, output overflow, transport/stream/write failure) — retire
      // the session by identity rather than risk reusing a bad VM. Ordinary
      // user-code failures return via exit codes and never reach this path.
      if (session) {
        logger.warn(
          { functionId, dependencyHash, error: errorMessage },
          'Execution infrastructure error; retiring sandbox from pool'
        );
        this.retireSandbox(dependencyHash, session);
      }

      logger.error(
        {
          functionId,
          error: errorMessage,
          stack: error,
          executionTime,
          logs,
        },
        'Tenki Sandbox execution error'
      );

      return {
        success: false,
        error: errorMessage,
        logs,
        executionTime,
      };
    } finally {
      if (session) {
        this.release(dependencyHash, session);
      }
    }
  }
}
