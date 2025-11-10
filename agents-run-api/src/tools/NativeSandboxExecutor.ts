/**
 * NativeSandboxExecutor - Function Tool Execution Engine
 * ========================================================
 *
 * Executes user-defined function tools in isolated sandboxes using native Node.js processes.
 * The main challenge here is that we can't just eval() user code - that's a security nightmare.
 * Instead, we spin up separate Node.js processes with their own dependency trees.
 *
 * The tricky part is making this fast. Installing deps every time would be brutal
 * (2-5s per execution), so we cache sandboxes based on their dependency fingerprint.
 *
 * How it works:
 *
 * 1. User calls a function tool
 * 2. We hash the dependencies (e.g., "axios@1.6.0,lodash@4.17.21")
 * 3. Check if we already have a sandbox with those deps installed
 * 4. If yes: reuse it. If no: create new one, install deps, cache it
 * 5. Write the user's function code to a temp file
 * 6. Execute it in the sandboxed process with resource limits
 * 7. Return the result
 *
 * Sandbox lifecycle:
 * - Created when first needed for a dependency set
 * - Reused up to 50 times or 5 minutes, whichever comes first
 * - Automatically cleaned up when expired
 * - Failed sandboxes are immediately destroyed
 *
 * Security stuff:
 * - Each execution runs in its own process (not just a function call)
 * - Output limited to 1MB to prevent memory bombs
 * - Timeouts with graceful SIGTERM, then SIGKILL if needed
 * - Runs as non-root when possible
 * - Uses OS temp directory so it gets cleaned up automatically
 *
 * Performance:
 * - Cold start: ~100-500ms (vs 2-5s without caching)
 * - Hot path: ~50-100ms (just execution, no install)
 * - Memory bounded by pool size limits
 *
 * Deployment notes:
 * - Uses /tmp on Linux/macOS, %TEMP% on Windows
 * - Works in Docker, Kubernetes, serverless (Vercel, Lambda)
 * - No files left in project directory (no git pollution)
 *
 * The singleton pattern here is important - we need one shared pool
 * across all tool executions, otherwise caching doesn't work.
 */

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  FUNCTION_TOOL_EXECUTION_TIMEOUT_MS_DEFAULT,
  FUNCTION_TOOL_SANDBOX_CLEANUP_INTERVAL_MS,
  FUNCTION_TOOL_SANDBOX_MAX_OUTPUT_SIZE_BYTES,
  FUNCTION_TOOL_SANDBOX_MAX_USE_COUNT,
  FUNCTION_TOOL_SANDBOX_POOL_TTL_MS,
  FUNCTION_TOOL_SANDBOX_QUEUE_WAIT_TIMEOUT_MS,
} from '../constants/execution-limits';
import { getLogger } from '../logger';
import type { SandboxConfig } from '../types/execution-context';
import { createExecutionWrapper, parseExecutionResult } from './sandbox-utils';

const logger = getLogger('native-sandbox-executor');

/**
 * Semaphore for limiting concurrent executions based on vCPU allocation
 */
class ExecutionSemaphore {
  private permits: number;
  private waitQueue: Array<{ resolve: () => void; reject: (error: Error) => void }> = [];
  private readonly maxWaitTime: number;

  constructor(permits: number, maxWaitTimeMs = FUNCTION_TOOL_SANDBOX_QUEUE_WAIT_TIMEOUT_MS) {
    this.permits = Math.max(1, permits); // Ensure at least 1 permit
    this.maxWaitTime = maxWaitTimeMs;
  }

  async acquire<T>(fn: () => Promise<T>): Promise<T> {
    await new Promise<void>((resolve, reject) => {
      if (this.permits > 0) {
        this.permits--;
        resolve();
        return;
      }

      const timeoutId = setTimeout(() => {
        const index = this.waitQueue.findIndex((item) => item.resolve === resolve);
        if (index !== -1) {
          this.waitQueue.splice(index, 1);
          reject(
            new Error(
              `Function execution queue timeout after ${this.maxWaitTime}ms. Too many concurrent executions.`
            )
          );
        }
      }, this.maxWaitTime);

      this.waitQueue.push({
        resolve: () => {
          clearTimeout(timeoutId);
          this.permits--;
          resolve();
        },
        reject,
      });
    });

    try {
      return await fn();
    } finally {
      this.permits++;

      const next = this.waitQueue.shift();
      if (next) {
        next.resolve();
      }
    }
  }

  getAvailablePermits(): number {
    return this.permits;
  }

  getQueueLength(): number {
    return this.waitQueue.length;
  }
}

export interface FunctionToolConfig {
  name?: string;
  description: string;
  inputSchema: Record<string, unknown>;
  executeCode: string;
  dependencies: Record<string, string>;
  sandboxConfig?: SandboxConfig;
}

interface SandboxPool {
  [key: string]: {
    sandboxDir: string;
    lastUsed: number;
    useCount: number;
    dependencies: Record<string, string>;
  };
}

export class NativeSandboxExecutor {
  private tempDir: string;
  private sandboxPool: SandboxPool = {};
  private static instance: NativeSandboxExecutor | null = null;
  private executionSemaphores: Map<number, ExecutionSemaphore> = new Map();

  constructor() {
    this.tempDir = join(tmpdir(), 'inkeep-sandboxes');
    this.ensureTempDir();
    this.startPoolCleanup();
  }

  static getInstance(): NativeSandboxExecutor {
    if (!NativeSandboxExecutor.instance) {
      NativeSandboxExecutor.instance = new NativeSandboxExecutor();
    }
    return NativeSandboxExecutor.instance;
  }

  private getSemaphore(vcpus: number): ExecutionSemaphore {
    const effectiveVcpus = Math.max(1, vcpus || 1);

    if (!this.executionSemaphores.has(effectiveVcpus)) {
      logger.debug({ vcpus: effectiveVcpus }, 'Creating new execution semaphore');
      this.executionSemaphores.set(effectiveVcpus, new ExecutionSemaphore(effectiveVcpus));
    }

    const semaphore = this.executionSemaphores.get(effectiveVcpus);
    if (!semaphore) {
      throw new Error(`Failed to create semaphore for ${effectiveVcpus} vCPUs`);
    }

    return semaphore;
  }

  getExecutionStats(): Record<string, { availablePermits: number; queueLength: number }> {
    const stats: Record<string, { availablePermits: number; queueLength: number }> = {};

    for (const [vcpus, semaphore] of this.executionSemaphores.entries()) {
      stats[`vcpu_${vcpus}`] = {
        availablePermits: semaphore.getAvailablePermits(),
        queueLength: semaphore.getQueueLength(),
      };
    }

    return stats;
  }

  private ensureTempDir() {
    try {
      mkdirSync(this.tempDir, { recursive: true });
    } catch {}
  }

  private generateDependencyHash(dependencies: Record<string, string>): string {
    const sortedDeps = Object.keys(dependencies)
      .sort()
      .map((key) => `${key}@${dependencies[key]}`)
      .join(',');
    return createHash('sha256').update(sortedDeps).digest('hex').substring(0, 16);
  }

  private getCachedSandbox(dependencyHash: string): string | null {
    const poolKey = dependencyHash;
    const sandbox = this.sandboxPool[poolKey];

    if (sandbox && existsSync(sandbox.sandboxDir)) {
      const now = Date.now();
      if (
        now - sandbox.lastUsed < FUNCTION_TOOL_SANDBOX_POOL_TTL_MS &&
        sandbox.useCount < FUNCTION_TOOL_SANDBOX_MAX_USE_COUNT
      ) {
        sandbox.lastUsed = now;
        sandbox.useCount++;
        logger.debug(
          {
            poolKey,
            useCount: sandbox.useCount,
            sandboxDir: sandbox.sandboxDir,
            lastUsed: new Date(sandbox.lastUsed).toISOString(),
          },
          'Reusing cached sandbox'
        );
        return sandbox.sandboxDir;
      } else {
        this.cleanupSandbox(sandbox.sandboxDir);
        delete this.sandboxPool[poolKey];
      }
    }

    return null;
  }

  private addToPool(
    dependencyHash: string,
    sandboxDir: string,
    dependencies: Record<string, string>
  ) {
    const poolKey = dependencyHash;

    if (this.sandboxPool[poolKey]) {
      this.cleanupSandbox(this.sandboxPool[poolKey].sandboxDir);
    }

    this.sandboxPool[poolKey] = {
      sandboxDir,
      lastUsed: Date.now(),
      useCount: 1,
      dependencies,
    };

    logger.debug({ poolKey, sandboxDir }, 'Added sandbox to pool');
  }

  private cleanupSandbox(sandboxDir: string) {
    try {
      rmSync(sandboxDir, { recursive: true, force: true });
      logger.debug({ sandboxDir }, 'Cleaned up sandbox');
    } catch (error) {
      logger.warn({ sandboxDir, error }, 'Failed to clean up sandbox');
    }
  }

  private startPoolCleanup() {
    setInterval(() => {
      const now = Date.now();
      const keysToDelete: string[] = [];

      for (const [key, sandbox] of Object.entries(this.sandboxPool)) {
        if (
          now - sandbox.lastUsed > FUNCTION_TOOL_SANDBOX_POOL_TTL_MS ||
          sandbox.useCount >= FUNCTION_TOOL_SANDBOX_MAX_USE_COUNT
        ) {
          this.cleanupSandbox(sandbox.sandboxDir);
          keysToDelete.push(key);
        }
      }

      keysToDelete.forEach((key) => {
        delete this.sandboxPool[key];
      });

      if (keysToDelete.length > 0) {
        logger.debug({ cleanedCount: keysToDelete.length }, 'Cleaned up expired sandboxes');
      }
    }, FUNCTION_TOOL_SANDBOX_CLEANUP_INTERVAL_MS);
  }

  private detectModuleType(
    executeCode: string,
    configuredRuntime?: 'node22' | 'typescript'
  ): 'cjs' | 'esm' {
    const esmPatterns = [
      /import\s+.*\s+from\s+['"]/g, // import ... from '...'
      /import\s*\(/g, // import(...)
      /export\s+(default|const|let|var|function|class)/g, // export statements
      /export\s*\{/g, // export { ... }
    ];

    const cjsPatterns = [
      /require\s*\(/g, // require(...)
      /module\.exports/g, // module.exports
      /exports\./g, // exports.something
    ];

    const hasEsmSyntax = esmPatterns.some((pattern) => pattern.test(executeCode));
    const hasCjsSyntax = cjsPatterns.some((pattern) => pattern.test(executeCode));

    if (configuredRuntime === 'typescript') {
      return hasCjsSyntax ? 'cjs' : 'esm';
    }

    if (hasEsmSyntax && hasCjsSyntax) {
      logger.warn(
        { executeCode: `${executeCode.substring(0, 100)}...` },
        'Both ESM and CommonJS syntax detected, defaulting to ESM'
      );
      return 'esm';
    }

    if (hasEsmSyntax) {
      return 'esm';
    }

    if (hasCjsSyntax) {
      return 'cjs';
    }

    return 'cjs';
  }

  async executeFunctionTool(toolId: string, args: any, config: FunctionToolConfig): Promise<any> {
    const vcpus = config.sandboxConfig?.vcpus || 1;
    const semaphore = this.getSemaphore(vcpus);

    logger.debug(
      {
        toolId,
        vcpus,
        availablePermits: semaphore.getAvailablePermits(),
        queueLength: semaphore.getQueueLength(),
        sandboxConfig: config.sandboxConfig,
        poolSize: Object.keys(this.sandboxPool).length,
      },
      'Acquiring execution slot for function tool'
    );

    return semaphore.acquire(async () => {
      return this.executeInSandbox_Internal(toolId, args, config);
    });
  }

  private async executeInSandbox_Internal(
    toolId: string,
    args: any,
    config: FunctionToolConfig
  ): Promise<any> {
    const dependencies = config.dependencies || {};
    const dependencyHash = this.generateDependencyHash(dependencies);

    logger.debug(
      {
        toolId,
        dependencies,
        dependencyHash,
        sandboxConfig: config.sandboxConfig,
        poolSize: Object.keys(this.sandboxPool).length,
      },
      'Executing function tool'
    );

    let sandboxDir = this.getCachedSandbox(dependencyHash);
    let isNewSandbox = false;

    if (!sandboxDir) {
      sandboxDir = join(this.tempDir, `sandbox-${dependencyHash}-${Date.now()}`);
      mkdirSync(sandboxDir, { recursive: true });
      isNewSandbox = true;

      logger.debug(
        {
          toolId,
          dependencyHash,
          sandboxDir,
          dependencies,
        },
        'Creating new sandbox'
      );

      const moduleType = this.detectModuleType(config.executeCode, config.sandboxConfig?.runtime);

      const packageJson = {
        name: `function-tool-${toolId}`,
        version: '1.0.0',
        ...(moduleType === 'esm' && { type: 'module' }),
        dependencies,
        scripts: {
          start: moduleType === 'esm' ? 'node index.mjs' : 'node index.js',
        },
      };

      writeFileSync(join(sandboxDir, 'package.json'), JSON.stringify(packageJson, null, 2), 'utf8');

      if (Object.keys(dependencies).length > 0) {
        await this.installDependencies(sandboxDir);
      }

      this.addToPool(dependencyHash, sandboxDir, dependencies);
    }

    try {
      const moduleType = this.detectModuleType(config.executeCode, config.sandboxConfig?.runtime);

      const executionCode = createExecutionWrapper(config.executeCode, args);
      const fileExtension = moduleType === 'esm' ? 'mjs' : 'js';
      writeFileSync(join(sandboxDir, `index.${fileExtension}`), executionCode, 'utf8');

      const result = await this.executeInSandbox(
        sandboxDir,
        config.sandboxConfig?.timeout || FUNCTION_TOOL_EXECUTION_TIMEOUT_MS_DEFAULT,
        moduleType,
        config.sandboxConfig
      );

      return result;
    } catch (error) {
      if (isNewSandbox) {
        this.cleanupSandbox(sandboxDir);
        const poolKey = dependencyHash;
        delete this.sandboxPool[poolKey];
      }
      throw error;
    }
  }

  private async installDependencies(sandboxDir: string): Promise<void> {
    return new Promise((resolve, reject) => {
      // Configure npm environment variables to use sandbox directory
      // This fixes issues in serverless environments like Vercel where
      // the default home directory paths don't exist or aren't writable
      const npmEnv = {
        ...process.env,
        npm_config_cache: join(sandboxDir, '.npm-cache'),
        npm_config_logs_dir: join(sandboxDir, '.npm-logs'),
        npm_config_tmp: join(sandboxDir, '.npm-tmp'),
        HOME: sandboxDir,
        npm_config_update_notifier: 'false',
        npm_config_progress: 'false',
        npm_config_loglevel: 'error',
      };

      const npm = spawn('npm', ['install', '--no-audit', '--no-fund'], {
        cwd: sandboxDir,
        stdio: 'pipe',
        env: npmEnv,
      });

      let stderr = '';

      npm.stdout?.on('data', () => {});

      npm.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      npm.on('close', (code) => {
        if (code === 0) {
          logger.debug({ sandboxDir }, 'Dependencies installed successfully');
          resolve();
        } else {
          logger.error({ sandboxDir, code, stderr }, 'Failed to install dependencies');
          reject(new Error(`npm install failed with code ${code}: ${stderr}`));
        }
      });

      npm.on('error', (err) => {
        logger.error({ sandboxDir, error: err }, 'Failed to spawn npm install');
        reject(err);
      });
    });
  }

  private async executeInSandbox(
    sandboxDir: string,
    timeout: number,
    moduleType: 'cjs' | 'esm',
    _sandboxConfig?: FunctionToolConfig['sandboxConfig']
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const fileExtension = moduleType === 'esm' ? 'mjs' : 'js';

      const spawnOptions = {
        cwd: sandboxDir,
        stdio: 'pipe' as const,
        uid: process.getuid ? process.getuid() : undefined,
        gid: process.getgid ? process.getgid() : undefined,
      };

      const node = spawn('node', [`index.${fileExtension}`], spawnOptions);

      let stdout = '';
      let stderr = '';
      let outputSize = 0;

      node.stdout?.on('data', (data: Buffer) => {
        const dataStr = data.toString();
        outputSize += dataStr.length;

        if (outputSize > FUNCTION_TOOL_SANDBOX_MAX_OUTPUT_SIZE_BYTES) {
          node.kill('SIGTERM');
          reject(
            new Error(
              `Output size exceeded limit of ${FUNCTION_TOOL_SANDBOX_MAX_OUTPUT_SIZE_BYTES} bytes`
            )
          );
          return;
        }

        stdout += dataStr;
      });

      node.stderr?.on('data', (data: Buffer) => {
        const dataStr = data.toString();
        outputSize += dataStr.length;

        if (outputSize > FUNCTION_TOOL_SANDBOX_MAX_OUTPUT_SIZE_BYTES) {
          node.kill('SIGTERM');
          reject(
            new Error(
              `Output size exceeded limit of ${FUNCTION_TOOL_SANDBOX_MAX_OUTPUT_SIZE_BYTES} bytes`
            )
          );
          return;
        }

        stderr += dataStr;
      });

      const timeoutId = setTimeout(() => {
        logger.warn({ sandboxDir, timeout }, 'Function execution timed out, killing process');
        node.kill('SIGTERM');

        const forceKillTimeout = Math.min(Math.max(timeout / 10, 2000), 5000);
        setTimeout(() => {
          try {
            node.kill('SIGKILL');
          } catch {}
        }, forceKillTimeout);

        reject(new Error(`Function execution timed out after ${timeout}ms`));
      }, timeout);

      node.on('close', (code: number | null, signal: NodeJS.Signals | null) => {
        clearTimeout(timeoutId);

        if (code === 0) {
          try {
            const result = parseExecutionResult(stdout, 'function', logger);
            if (typeof result === 'object' && result !== null && 'success' in result) {
              const parsed = result as { success: boolean; result?: unknown; error?: string };
              if (parsed.success) {
                resolve(parsed.result);
              } else {
                reject(new Error(parsed.error || 'Function execution failed'));
              }
            } else {
              resolve(result);
            }
          } catch (parseError) {
            logger.error({ stdout, stderr, parseError }, 'Failed to parse function result');
            reject(new Error(`Invalid function result: ${stdout}`));
          }
        } else {
          const errorMsg = signal
            ? `Function execution killed by signal ${signal}: ${stderr}`
            : `Function execution failed with code ${code}: ${stderr}`;
          logger.error({ code, signal, stderr }, 'Function execution failed');
          reject(new Error(errorMsg));
        }
      });

      node.on('error', (error: Error) => {
        clearTimeout(timeoutId);
        logger.error({ sandboxDir, error }, 'Failed to spawn node process');
        reject(error);
      });
    });
  }
}
