import crypto from 'node:crypto';
import { Sandbox } from '@vercel/sandbox';
import {
  FUNCTION_TOOL_SANDBOX_CLEANUP_INTERVAL_MS,
  FUNCTION_TOOL_SANDBOX_MAX_USE_COUNT,
  FUNCTION_TOOL_SANDBOX_POOL_TTL_MS,
} from '@inkeep/agents-core';
import { getLogger } from '../logger';
import type { VercelSandboxConfig } from '../types/execution-context';
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
  useCount: number;
  dependencies: Record<string, string>;
}

/**
 * Vercel Sandbox Executor with pooling/reuse
 * Executes function tools in isolated Vercel Sandbox MicroVMs
 * Caches and reuses sandboxes based on dependencies to improve performance
 */
export class VercelSandboxExecutor {
  private static instance: VercelSandboxExecutor;
  private config: VercelSandboxConfig;
  private sandboxPool: Map<string, CachedSandbox> = new Map();
  private readonly POOL_TTL = FUNCTION_TOOL_SANDBOX_POOL_TTL_MS;
  private readonly MAX_USE_COUNT = FUNCTION_TOOL_SANDBOX_MAX_USE_COUNT;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  private constructor(config: VercelSandboxConfig) {
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

  /**
   * Get singleton instance of VercelSandboxExecutor
   */
  public static getInstance(config: VercelSandboxConfig): VercelSandboxExecutor {
    if (!VercelSandboxExecutor.instance) {
      VercelSandboxExecutor.instance = new VercelSandboxExecutor(config);
    }
    return VercelSandboxExecutor.instance;
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

    // Check if sandbox is still valid
    if (age > this.POOL_TTL || cached.useCount >= this.MAX_USE_COUNT) {
      logger.debug(
        {
          dependencyHash,
          age,
          useCount: cached.useCount,
          ttl: this.POOL_TTL,
          maxUseCount: this.MAX_USE_COUNT,
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
      try {
        await cached.sandbox.stop();
        logger.debug({ dependencyHash }, 'Sandbox stopped');
      } catch (error) {
        logger.warn({ error, dependencyHash }, 'Error stopping sandbox');
      }
      this.sandboxPool.delete(dependencyHash);
    }
  }

  /**
   * Start periodic cleanup of expired sandboxes
   */
  private startPoolCleanup(): void {
    this.cleanupInterval = setInterval(
      () => {
        const now = Date.now();
        const toRemove: string[] = [];

        for (const [hash, cached] of this.sandboxPool.entries()) {
          const age = now - cached.createdAt;
          if (age > this.POOL_TTL || cached.useCount >= this.MAX_USE_COUNT) {
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
      },
      FUNCTION_TOOL_SANDBOX_CLEANUP_INTERVAL_MS
    );
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
   * Create .env file content from environment variables
   * Note: Currently creates empty placeholders. Values will be populated in the future.
   */
  private createEnvFileContent(envVarNames: Set<string>): string {
    const envLines: string[] = [];

    for (const varName of envVarNames) {
      // TODO: Populate with actual values from secure source e.g. credentials manager
      // For now, just create empty placeholders
      envLines.push(`${varName}=""`);
      logger.debug({ varName }, 'Adding environment variable placeholder to sandbox');
    }

    return envLines.join('\n');
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

      // Try to get cached sandbox
      let sandbox = this.getCachedSandbox(dependencyHash);
      let isNewSandbox = false;

      // Create new sandbox if not cached
      if (!sandbox) {
        isNewSandbox = true;
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
            functionId,
            sandboxId: sandbox.sandboxId,
            dependencyHash,
          },
          `New sandbox created for function ${functionId}`
        );

        // Add to pool for reuse
        this.addToPool(dependencyHash, sandbox, dependencies);
      } else {
        logger.info(
          {
            functionId,
            sandboxId: sandbox.sandboxId,
            dependencyHash,
          },
          `Reusing cached sandbox for function ${functionId}`
        );
      }

      // Increment use count
      this.incrementUseCount(dependencyHash);

      try {
        // Install dependencies only for new sandboxes
        if (
          isNewSandbox &&
          toolConfig.dependencies &&
          Object.keys(toolConfig.dependencies).length > 0
        ) {
          logger.debug(
            {
              functionId,
              functionName: toolConfig.name,
              dependencies: toolConfig.dependencies,
            },
            'Installing dependencies in new sandbox'
          );

          const packageJson = {
            dependencies: toolConfig.dependencies,
          };

          // Write package.json using writeFiles
          const packageJsonContent = JSON.stringify(packageJson, null, 2);
          await sandbox.writeFiles([
            {
              path: 'package.json',
              content: Buffer.from(packageJsonContent, 'utf-8'),
            },
          ]);

          // Run npm install
          const installCmd = await sandbox.runCommand({
            cmd: 'npm',
            args: ['install', '--omit=dev'],
          });

          const installStdout = await installCmd.stdout();
          const installStderr = await installCmd.stderr();

          if (installStdout) {
            logs.push(installStdout);
          }
          if (installStderr) {
            logs.push(installStderr);
          }

          if (installCmd.exitCode !== 0) {
            throw new Error(`Failed to install dependencies: ${installStderr}`);
          }

          logger.info(
            {
              functionId,
              dependencyHash,
            },
            'Dependencies installed successfully'
          );
        }

        // Create the execution wrapper
        const executionCode = createExecutionWrapper(toolConfig.executeCode, args);

        // Detect and prepare environment variables
        const envVars = this.extractEnvVars(toolConfig.executeCode);
        const filesToWrite: Array<{ path: string; content: Buffer }> = [];

        // Write the code file
        const filename = this.config.runtime === 'typescript' ? 'execute.ts' : 'execute.js';
        filesToWrite.push({
          path: filename,
          content: Buffer.from(executionCode, 'utf-8'),
        });

        // Write .env file if environment variables are detected
        if (envVars.size > 0) {
          const envFileContent = this.createEnvFileContent(envVars);
          if (envFileContent) {
            filesToWrite.push({
              path: '.env',
              content: Buffer.from(envFileContent, 'utf-8'),
            });

            logger.info(
              {
                functionId,
                envVarCount: envVars.size,
                envVars: Array.from(envVars),
              },
              'Creating environment variable placeholders in sandbox'
            );
          }
        }

        // Write all files to sandbox
        await sandbox.writeFiles(filesToWrite);

        logger.info(
          {
            functionId,
            runtime: this.config.runtime === 'typescript' ? 'tsx' : 'node',
            hasEnvVars: envVars.size > 0,
          },
          `Execution code written to file for runtime ${this.config.runtime}`
        );

        // Execute the code with dotenv if env vars exist
        const executeCmd = await (async () => {
          if (envVars.size > 0) {
            // Use dotenv-cli to load .env file automatically
            return sandbox.runCommand({
              cmd: 'npx',
              args:
                this.config.runtime === 'typescript'
                  ? ['--yes', 'dotenv-cli', '--', 'npx', 'tsx', filename]
                  : ['--yes', 'dotenv-cli', '--', 'node', filename],
            });
          }
          // Execute normally without dotenv
          const runtime = this.config.runtime === 'typescript' ? 'tsx' : 'node';
          return sandbox.runCommand({
            cmd: runtime,
            args: [filename],
          });
        })();

        // Collect logs
        const executeStdout = await executeCmd.stdout();
        const executeStderr = await executeCmd.stderr();

        if (executeStdout) {
          logs.push(executeStdout);
        }
        if (executeStderr) {
          logs.push(executeStderr);
        }

        const executionTime = Date.now() - startTime;

        // Check for execution errors
        if (executeCmd.exitCode !== 0) {
          logger.error(
            {
              functionId,
              exitCode: executeCmd.exitCode,
              stderr: executeStderr,
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

        // Parse the result from stdout
        const result = parseExecutionResult(executeStdout, functionId, logger);

        logger.info(
          {
            functionId,
            executionTime,
          },
          'Function executed successfully in Vercel Sandbox'
        );

        return {
          success: true,
          result,
          logs,
          executionTime,
        };
      } catch (innerError) {
        // On error, remove from pool so it doesn't get reused
        await this.removeSandbox(dependencyHash);
        throw innerError;
      }
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error(
        {
          functionId,
          error: errorMessage,
          executionTime,
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
