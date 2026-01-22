import { getLogger } from '../../../logger';
import type { SandboxConfig, VercelSandboxConfig } from '../types/executionContext';
import { type FunctionToolConfig, NativeSandboxExecutor } from './NativeSandboxExecutor';
import { VercelSandboxExecutor } from './VercelSandboxExecutor';

const logger = getLogger('SandboxExecutorFactory');

/**
 * Factory for creating and managing sandbox executors
 * Routes execution to the appropriate sandbox provider (native or Vercel)
 */
export class SandboxExecutorFactory {
  private static instance: SandboxExecutorFactory;
  private static sessionFactories: Map<string, SandboxExecutorFactory> = new Map();
  private nativeExecutor: NativeSandboxExecutor | null = null;
  private vercelExecutors: Map<string, VercelSandboxExecutor> = new Map();

  public constructor() {
    logger.info({}, 'SandboxExecutorFactory initialized');
  }

  /**
   * Get singleton instance of SandboxExecutorFactory
   */
  public static getInstance(): SandboxExecutorFactory {
    if (!SandboxExecutorFactory.instance) {
      SandboxExecutorFactory.instance = new SandboxExecutorFactory();
    }
    return SandboxExecutorFactory.instance;
  }

  /**
   * Get a session-scoped instance of SandboxExecutorFactory.
   * Intended to scope Vercel sandbox pooling to a single message/session.
   */
  public static getForSession(sessionId: string): SandboxExecutorFactory {
    const existing = SandboxExecutorFactory.sessionFactories.get(sessionId);
    if (existing) return existing;
    const created = new SandboxExecutorFactory();
    SandboxExecutorFactory.sessionFactories.set(sessionId, created);
    return created;
  }

  /**
   * Cleanup and remove a session-scoped SandboxExecutorFactory.
   */
  public static async cleanupSession(sessionId: string): Promise<void> {
    const factory = SandboxExecutorFactory.sessionFactories.get(sessionId);
    if (!factory) return;
    await factory.cleanup();
    SandboxExecutorFactory.sessionFactories.delete(sessionId);
  }

  /**
   * Execute a function tool using the appropriate sandbox provider
   */
  public async executeFunctionTool(
    functionId: string,
    args: Record<string, unknown>,
    config: FunctionToolConfig
  ): Promise<unknown> {
    const sandboxConfig = config.sandboxConfig;

    if (!sandboxConfig) {
      throw new Error('Sandbox configuration is required for function tool execution');
    }

    if (sandboxConfig.provider === 'native') {
      return this.executeInNativeSandbox(functionId, args, config);
    }

    if (sandboxConfig.provider === 'vercel') {
      return this.executeInVercelSandbox(functionId, args, config);
    }

    throw new Error(`Unknown sandbox provider: ${(sandboxConfig as SandboxConfig).provider}`);
  }

  /**
   * Execute in native sandbox
   */
  private async executeInNativeSandbox(
    functionId: string,
    args: Record<string, unknown>,
    config: FunctionToolConfig
  ): Promise<unknown> {
    if (!this.nativeExecutor) {
      this.nativeExecutor = new NativeSandboxExecutor();
      logger.info({}, 'Native sandbox executor created');
    }

    return this.nativeExecutor.executeFunctionTool(functionId, args, config);
  }

  /**
   * Execute in Vercel sandbox
   */
  private async executeInVercelSandbox(
    functionId: string,
    args: Record<string, unknown>,
    config: FunctionToolConfig
  ): Promise<unknown> {
    const vercelConfig = config.sandboxConfig as VercelSandboxConfig;

    // Create a key for this Vercel configuration (teamId + projectId)
    const configKey = `${vercelConfig.teamId}:${vercelConfig.projectId}`;

    // Get or create Vercel executor for this configuration
    if (!this.vercelExecutors.has(configKey)) {
      const executor = new VercelSandboxExecutor(vercelConfig);
      this.vercelExecutors.set(configKey, executor);
      logger.info(
        {
          teamId: vercelConfig.teamId,
          projectId: vercelConfig.projectId,
        },
        'Vercel sandbox executor created'
      );
    }

    const executor = this.vercelExecutors.get(configKey);
    if (!executor) {
      throw new Error(`Failed to get Vercel executor for config: ${configKey}`);
    }

    const result = await executor.executeFunctionTool(functionId, args, config);

    if (!result.success) {
      throw new Error(result.error || 'Vercel sandbox execution failed');
    }

    return result.result;
  }

  /**
   * Clean up all sandbox executors
   */
  public async cleanup(): Promise<void> {
    logger.info({}, 'Cleaning up sandbox executors');

    if (this.nativeExecutor) {
      await this.nativeExecutor.cleanup();
      this.nativeExecutor = null;
    }

    for (const [key, executor] of this.vercelExecutors.entries()) {
      await executor.cleanup();
      this.vercelExecutors.delete(key);
    }

    logger.info({}, 'Sandbox executor cleanup completed');
  }
}
