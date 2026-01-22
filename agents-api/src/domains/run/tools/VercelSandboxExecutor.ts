import crypto from 'node:crypto';
import { Sandbox } from '@vercel/sandbox';
import { getLogger } from '../../../logger';
import {
  FUNCTION_TOOL_SANDBOX_CLEANUP_INTERVAL_MS,
  FUNCTION_TOOL_SANDBOX_MAX_USE_COUNT,
  FUNCTION_TOOL_SANDBOX_POOL_TTL_MS,
} from '../constants/execution-limits';
import type { VercelSandboxConfig } from '../types/executionContext';
import type { FunctionToolConfig } from './NativeSandboxExecutor';
import { createExecutionWrapper, parseExecutionResult } from './sandbox-utils';

const logger = getLogger('VercelSandboxExecutor');

export interface ExecutionResult {
  success: boolean;
  result?: unknown;
  error?: string;
  logs?: string[];
  executionTime?: number;
}

interface CachedSandbox {
  sandbox: Sandbox;
  createdAt: number;
  timeoutMs: number;
  useCount: number;
  dependencies: Record<string, string>;
}

/**
 * Vercel Sandbox Executor with pooling/reuse
 * Executes function tools in isolated Vercel Sandbox MicroVMs
 * Caches and reuses sandboxes based on dependencies to improve performance
 */
export class VercelSandboxExecutor {
  private config: VercelSandboxConfig;
  private sandboxPool: Map<string, CachedSandbox> = new Map();
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;
  private sandboxInitPromises: Map<string, Promise<Sandbox>> = new Map();

  public constructor(config: VercelSandboxConfig) {
    this.config = config;
    logger.info(
      {
        teamId: config.teamId,
        projectId: config.projectId,
        runtime: config.runtime,
        timeout: config.timeout,
        vcpus: config.vcpus,
      },
      'VercelSandboxExecutor initialized with pooling'
    );
    this.startPoolCleanup();
  }

  private async getOrCreateSandbox(params: {
    functionId: string;
    toolName?: string;
    dependencyHash: string;
    dependencies: Record<string, string>;
  }): Promise<Sandbox> {
    const cached = this.getCachedSandbox(params.dependencyHash);
    if (cached) return cached;

    const existingInit = this.sandboxInitPromises.get(params.dependencyHash);
    if (existingInit) {
      await existingInit;
      const afterInit = this.getCachedSandbox(params.dependencyHash);
      if (!afterInit) {
        throw new Error('Sandbox initialization finished but sandbox not found in pool');
      }
      return afterInit;
    }

    const initPromise = (async (): Promise<Sandbox> => {
      let sandbox: Sandbox | null = null;
      try {
        sandbox = await Sandbox.create({
          token: this.config.token,
          teamId: this.config.teamId,
          projectId: this.config.projectId,
          timeout: this.config.timeout,
          resources: {
            vcpus: this.config.vcpus || 1,
          },
          runtime: this.config.runtime,
        });

        logger.info(
          {
            functionId: params.functionId,
            functionName: params.toolName,
            sandboxId: sandbox.sandboxId,
            dependencyHash: params.dependencyHash,
          },
          'New sandbox created'
        );

        this.addToPool(params.dependencyHash, sandbox, params.dependencies);

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
          await sandbox.writeFiles([
            {
              path: 'package.json',
              content: Buffer.from(packageJsonContent, 'utf-8'),
            },
          ]);

          const installCmd = await sandbox.runCommand({
            cmd: 'npm',
            args: ['install', '--omit=dev'],
            cwd: '/vercel/sandbox',
          });

          const installStdout = await installCmd.stdout();
          const installStderr = await installCmd.stderr();
          if (installStdout) logger.debug({ functionId: params.functionId }, installStdout);
          if (installStderr) logger.debug({ functionId: params.functionId }, installStderr);

          if (installCmd.exitCode !== 0) {
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

        return sandbox;
      } catch (error) {
        await this.removeSandbox(params.dependencyHash);
        if (sandbox) {
          try {
            await sandbox.stop();
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
    return initPromise;
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
   * Get a cached sandbox if available and still valid
   */
  private getCachedSandbox(dependencyHash: string): Sandbox | null {
    const cached = this.sandboxPool.get(dependencyHash);
    if (!cached) return null;

    const now = Date.now();
    const age = now - cached.createdAt;
    const timeoutSafetyMs = 2_000;
    const timeRemaining = cached.timeoutMs - age;

    // Check if sandbox is still valid
    if (
      age > FUNCTION_TOOL_SANDBOX_POOL_TTL_MS ||
      cached.useCount >= FUNCTION_TOOL_SANDBOX_MAX_USE_COUNT ||
      timeRemaining <= timeoutSafetyMs
    ) {
      logger.debug(
        {
          dependencyHash,
          age,
          useCount: cached.useCount,
          ttl: FUNCTION_TOOL_SANDBOX_POOL_TTL_MS,
          maxUseCount: FUNCTION_TOOL_SANDBOX_MAX_USE_COUNT,
          timeoutMs: cached.timeoutMs,
          timeRemaining,
        },
        'Sandbox expired, will create new one'
      );
      this.removeSandbox(dependencyHash);
      return null;
    }

    logger.debug(
      {
        dependencyHash,
        useCount: cached.useCount,
        age,
        timeoutMs: cached.timeoutMs,
        timeRemaining,
      },
      'Reusing cached sandbox'
    );

    return cached.sandbox;
  }

  /**
   * Add sandbox to pool
   */
  private addToPool(
    dependencyHash: string,
    sandbox: Sandbox,
    dependencies: Record<string, string>
  ): void {
    this.sandboxPool.set(dependencyHash, {
      sandbox,
      createdAt: Date.now(),
      timeoutMs: sandbox.timeout,
      useCount: 0,
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
   * Increment use count for a sandbox
   */
  private incrementUseCount(dependencyHash: string): void {
    const cached = this.sandboxPool.get(dependencyHash);
    if (cached) {
      cached.useCount++;
    }
  }

  /**
   * Remove and clean up a sandbox
   */
  private async removeSandbox(dependencyHash: string): Promise<void> {
    const cached = this.sandboxPool.get(dependencyHash);
    if (cached) {
      // Remove from pool immediately to prevent concurrent re-use while we stop it.
      this.sandboxPool.delete(dependencyHash);
      try {
        await cached.sandbox.stop();
        logger.debug({ dependencyHash }, 'Sandbox stopped');
      } catch (error) {
        logger.warn({ error, dependencyHash }, 'Error stopping sandbox');
      }
    }
  }

  /**
   * Start periodic cleanup of expired sandboxes
   */
  private startPoolCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      const toRemove: string[] = [];

      for (const [hash, cached] of this.sandboxPool.entries()) {
        const age = now - cached.createdAt;
        const timeoutSafetyMs = 2_000;
        const timeRemaining = cached.timeoutMs - age;
        if (
          age > FUNCTION_TOOL_SANDBOX_POOL_TTL_MS ||
          cached.useCount >= FUNCTION_TOOL_SANDBOX_MAX_USE_COUNT ||
          timeRemaining <= timeoutSafetyMs
        ) {
          toRemove.push(hash);
        }
      }

      if (toRemove.length > 0) {
        logger.info(
          {
            count: toRemove.length,
            poolSize: this.sandboxPool.size,
          },
          'Cleaning up expired sandboxes'
        );

        for (const hash of toRemove) {
          this.removeSandbox(hash);
        }
      }
    }, FUNCTION_TOOL_SANDBOX_CLEANUP_INTERVAL_MS);
  }

  /**
   * Cleanup all sandboxes and stop cleanup interval
   */
  public async cleanup(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    logger.info(
      {
        poolSize: this.sandboxPool.size,
      },
      'Cleaning up all sandboxes'
    );

    this.sandboxInitPromises.clear();

    const promises = Array.from(this.sandboxPool.keys()).map((hash) => this.removeSandbox(hash));
    await Promise.all(promises);
  }

  /**
   * Extract environment variable names from code
   * Matches patterns like process.env.VAR_NAME or process.env['VAR_NAME']
   */
  private extractEnvVars(code: string): Set<string> {
    const envVars = new Set<string>();

    // Match process.env.VARIABLE_NAME
    const dotNotationRegex = /process\.env\.([A-Z_][A-Z0-9_]*)/g;
    let match = dotNotationRegex.exec(code);
    while (match !== null) {
      envVars.add(match[1]);
      match = dotNotationRegex.exec(code);
    }

    // Match process.env['VARIABLE_NAME'] or process.env["VARIABLE_NAME"]
    const bracketNotationRegex = /process\.env\[['"]([A-Z_][A-Z0-9_]*)['"]\]/g;
    match = bracketNotationRegex.exec(code);
    while (match !== null) {
      envVars.add(match[1]);
      match = bracketNotationRegex.exec(code);
    }

    return envVars;
  }

  /**
   * Execute a function tool in Vercel Sandbox with pooling
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
    const runRelDir = `runs/${runId}`;
    const filename = this.config.runtime === 'typescript' ? 'execute.ts' : 'execute.js';
    const runFilePath = `${runRelDir}/${filename}`;

    try {
      logger.info(
        {
          functionId,
          functionName: toolConfig.name,
          dependencyHash,
          poolSize: this.sandboxPool.size,
        },
        'Executing function in Vercel Sandbox'
      );

      const sandbox = await this.getOrCreateSandbox({
        functionId,
        toolName: toolConfig.name,
        dependencyHash,
        dependencies,
      });

      this.incrementUseCount(dependencyHash);

      try {
        const executionCode = createExecutionWrapper(toolConfig.executeCode, args);
        const envVars = this.extractEnvVars(toolConfig.executeCode);
        const env =
          envVars.size > 0 ? Object.fromEntries(Array.from(envVars).map((k) => [k, ''])) : {};

        const mkdirCmd = await sandbox.runCommand({
          cmd: 'mkdir',
          args: ['-p', runRelDir],
          cwd: '/vercel/sandbox',
        });
        const mkdirStderr = await mkdirCmd.stderr();
        if (mkdirCmd.exitCode !== 0) {
          throw new Error(mkdirStderr || 'Failed to create run directory');
        }

        await sandbox.writeFiles([
          {
            path: runFilePath,
            content: Buffer.from(executionCode, 'utf-8'),
          },
        ]);

        const runtime = this.config.runtime === 'typescript' ? 'tsx' : 'node';
        const executeCmd =
          this.config.runtime === 'typescript'
            ? await sandbox.runCommand({
                cmd: 'npx',
                args: ['--yes', 'tsx', filename],
                cwd: `/vercel/sandbox/${runRelDir}`,
                env,
              })
            : await sandbox.runCommand({
                cmd: runtime,
                args: [filename],
                cwd: `/vercel/sandbox/${runRelDir}`,
                env,
              });

        const executeStdout = await executeCmd.stdout();
        const executeStderr = await executeCmd.stderr();

        if (executeStdout) logs.push(executeStdout);
        if (executeStderr) logs.push(executeStderr);

        const executionTime = Date.now() - startTime;

        if (executeCmd.exitCode !== 0) {
          logger.error(
            {
              functionId,
              exitCode: executeCmd.exitCode,
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

        const result = parseExecutionResult(executeStdout, functionId, logger);

        logger.info(
          {
            functionId,
            executionTime,
            logs,
          },
          'Function executed successfully in Vercel Sandbox'
        );

        return {
          success: true,
          result,
          logs,
          executionTime,
        };
      } finally {
        try {
          await sandbox.runCommand({
            cmd: 'rm',
            args: ['-rf', runRelDir],
            cwd: '/vercel/sandbox',
          });
        } catch {
          // ignore
        }
      }
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error(
        {
          functionId,
          error: errorMessage,
          stack: error,
          executionTime,
          logs,
        },
        'Vercel Sandbox execution error'
      );

      return {
        success: false,
        error: errorMessage,
        logs,
        executionTime,
      };
    }
  }
}
