import { Sandbox } from '@vercel/sandbox';
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

/**
 * Vercel Sandbox Executor
 * Executes function tools in isolated Vercel Sandbox MicroVMs
 */
export class VercelSandboxExecutor {
  private static instance: VercelSandboxExecutor;
  private config: VercelSandboxConfig;

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
      'VercelSandboxExecutor initialized'
    );
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
   * Execute a function tool in Vercel Sandbox
   */
  public async executeFunctionTool(
    functionId: string,
    args: Record<string, unknown>,
    toolConfig: FunctionToolConfig
  ): Promise<ExecutionResult> {
    const startTime = Date.now();
    const logs: string[] = [];

    try {
      logger.info(
        {
          functionId,
          functionName: toolConfig.name,
        },
        'Executing function in Vercel Sandbox'
      );

      // Create sandbox instance
      const sandbox = await Sandbox.create({
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
        },
        `Sandbox created for function ${functionId}`
      );

      try {
        // Install dependencies if provided
        if (toolConfig.dependencies && Object.keys(toolConfig.dependencies).length > 0) {
          logger.debug(
            {
              functionId,
              functionName: toolConfig.name,
              dependencies: toolConfig.dependencies,
            },
            'Installing dependencies'
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
        }

        // Create the execution wrapper
        const executionCode = createExecutionWrapper(toolConfig.executeCode, args);

        // Write the code to a file using writeFiles
        const filename = this.config.runtime === 'typescript' ? 'execute.ts' : 'execute.js';
        await sandbox.writeFiles([
          {
            path: filename,
            content: Buffer.from(executionCode, 'utf-8'),
          },
        ]);

        logger.info(
          {
            functionId,
            runtime: this.config.runtime === 'typescript' ? 'tsx' : 'node',
          },
          `Execution code written to file for runtime ${this.config.runtime}`
        );

        // Execute the code
        const runtime = this.config.runtime === 'typescript' ? 'tsx' : 'node';
        const executeCmd = await sandbox.runCommand({
          cmd: runtime,
          args: [filename],
        });

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
      } finally {
        // Clean up the sandbox
        await sandbox.stop();
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

  /**
   * Clean up resources
   */
  public async cleanup(): Promise<void> {
    logger.info({}, 'VercelSandboxExecutor cleanup completed');
  }
}
