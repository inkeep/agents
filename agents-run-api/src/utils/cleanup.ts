/**
 * Cleanup utilities for gracefully shutting down resources
 * Helps prevent Node.js processes from hanging
 */

import { getLogger } from '../logger';

const logger = getLogger('cleanup');

/**
 * Gracefully exit the process after cleaning up resources
 */
export function gracefulExit(code: number = 0, delayMs: number = 1000, message?: string): void {
  if (message) {
    logger.info({}, message);
  }

  setTimeout(() => {
    logger.debug({}, 'Forcing process exit after cleanup delay');
    process.exit(code);
  }, delayMs);
}

/**
 * Setup signal handlers for graceful shutdown
 */
export function setupGracefulShutdown(
  cleanupFn?: () => Promise<void> | void,
  exitDelayMs: number = 2000
): void {
  const signals = ['SIGTERM', 'SIGINT'] as const;
  let isShuttingDown = false;

  for (const signal of signals) {
    process.on(signal, async () => {
      if (isShuttingDown) {
        logger.warn({}, `Received ${signal} during shutdown, forcing exit`);
        process.exit(1);
      }

      logger.info({}, `Received ${signal}, starting graceful shutdown`);
      isShuttingDown = true;

      try {
        if (cleanupFn) {
          await cleanupFn();
        }
      } catch (error) {
        logger.error({ error }, 'Error during cleanup');
      }

      gracefulExit(0, exitDelayMs, '🚪 Graceful shutdown complete');
    });
  }
}

/**
 * Stop all tools associated with agents
 */
export async function stopAllAgentTools(
  agents: Array<{ getTools: () => Record<string, any> }>
): Promise<void> {
  logger.info({}, 'Stopping all agent tools...');

  for (const agent of agents) {
    const tools = agent.getTools();
    for (const toolInstance of Object.values(tools)) {
      if (toolInstance && typeof (toolInstance as any).stop === 'function') {
        try {
          await (toolInstance as any).stop();
          const toolName = (toolInstance as any).config?.name || 'unknown';
          logger.debug({}, `Stopped tool: ${toolName}`);
        } catch (error) {
          logger.warn(
            {},
            `Failed to stop tool: ${error instanceof Error ? error.message : 'Unknown error'}`
          );
        }
      }
    }
  }

  logger.info({}, 'All agent tools stopped');
}
