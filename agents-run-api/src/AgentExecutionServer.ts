import { type AgentFrameworkServerConfig, BaseServer } from '@inkeep/agents-core';
import app from './app.js';
import { getLogger } from './logger.js';

export const EXECUTION_API_PORT = 3003;
/**
 * Execution Server for chat, agent-to-agent communication, and MCP endpoints
 * Extends BaseServer with Execution API specific functionality
 */
export class AgentExecutionServer extends BaseServer {
  constructor(config: AgentFrameworkServerConfig = {}) {
    super(config, getLogger('ExecutionServer'));
  }

  /**
   * Initialize the Execution API application
   */
  protected async initialize(): Promise<void> {
    this.app = app;
    this.logger.info('Execution API initialized');
  }

  /**
   * Get default server options for Execution API
   */
  protected getServerOptions() {
    return {
      port: this.config.port || EXECUTION_API_PORT,
      keepAliveTimeout: 60000,
      keepAlive: true,
      requestTimeout: 60000,
      ...this.config.serverOptions,
    };
  }

  /**
   * Public method to initialize the server without starting HTTP listener
   * Useful for Vite dev mode where we need credential stores but Vite handles HTTP
   */
  async initializeOnly(): Promise<void> {
    if (!this.app) {
      await this.initialize();
    }
  }
}
