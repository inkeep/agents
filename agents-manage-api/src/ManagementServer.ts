import { BaseServer } from '@inkeep/agents-core';
import type { AgentFrameworkServerConfig } from '@inkeep/agents-core';
import { getLogger } from './logger.js';
import app from './app.js';
export const MANAGEMENT_API_PORT = 3002;
/**
 * Management Server for CRUD operations, entity management, and OAuth
 * Extends BaseServer with Management API specific functionality
 */
export class ManagementServer extends BaseServer {
  constructor(config: AgentFrameworkServerConfig = {}) {
    super(config, getLogger('ManagementServer'));
  }

  /**
   * Initialize the Management API application
   */
  protected async initialize(): Promise<void> {
    this.app = app;
    this.logger.info('Management API initialized');
  }

  /**
   * Get default server options for Management API
   */
  protected getServerOptions() {
    return {
      port: this.config.port || MANAGEMENT_API_PORT,
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

  /**
   * Custom cleanup for Management API before shutdown
   */
  protected async beforeShutdown(): Promise<void> {
    this.logger.info('Performing Management API cleanup...');

    // Add any Management API specific cleanup here
    // e.g., close database connections, cleanup OAuth sessions, etc.

    await super.beforeShutdown();
  }
}
