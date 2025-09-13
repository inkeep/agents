/**
 * Logger interface for core package components
 * Compatible with Pino logger signature
 */
export interface Logger {
  error(obj: any, msg?: string): void;
  warn(obj: any, msg?: string): void;
  info(obj: any, msg?: string): void;
  debug(obj: any, msg?: string): void;
  child?(bindings: Record<string, any>): Logger;
}

/**
 * Default console logger implementation
 */
export class ConsoleLogger implements Logger {
  constructor(private name: string) {}

  error(obj: any, msg?: string): void {
    if (msg) {
      console.error(`[${this.name}] ${msg}`, obj);
    } else if (typeof obj === 'string') {
      console.error(`[${this.name}] ${obj}`);
    } else {
      console.error(`[${this.name}]`, obj);
    }
  }

  warn(obj: any, msg?: string): void {
    if (msg) {
      console.warn(`[${this.name}] ${msg}`, obj);
    } else if (typeof obj === 'string') {
      console.warn(`[${this.name}] ${obj}`);
    } else {
      console.warn(`[${this.name}]`, obj);
    }
  }

  info(obj: any, msg?: string): void {
    if (msg) {
      console.info(`[${this.name}] ${msg}`, obj);
    } else if (typeof obj === 'string') {
      console.info(`[${this.name}] ${obj}`);
    } else {
      console.info(`[${this.name}]`, obj);
    }
  }

  debug(obj: any, msg?: string): void {
    if (msg) {
      console.debug(`[${this.name}] ${msg}`, obj);
    } else if (typeof obj === 'string') {
      console.debug(`[${this.name}] ${obj}`);
    } else {
      console.debug(`[${this.name}]`, obj);
    }
  }

  child(bindings: Record<string, any>): Logger {
    return new ConsoleLogger(`${this.name}:${JSON.stringify(bindings)}`);
  }
}

/**
 * No-op logger that silently ignores all log calls
 */
export class NoOpLogger implements Logger {
  error(_obj: any, _msg?: string): void {}
  warn(_obj: any, _msg?: string): void {}
  info(_obj: any, _msg?: string): void {}
  debug(_obj: any, _msg?: string): void {}
  child(_bindings: Record<string, any>): Logger {
    return this;
  }
}

/**
 * Logger factory configuration
 */
export interface LoggerFactoryConfig {
  defaultLogger?: Logger;
  loggerFactory?: (name: string) => Logger;
}

/**
 * Global logger factory singleton
 */
class LoggerFactory {
  private config: LoggerFactoryConfig = {};
  private loggers = new Map<string, Logger>();

  /**
   * Configure the logger factory
   */
  configure(config: LoggerFactoryConfig): void {
    this.config = config;
    // Clear cached loggers when reconfigured
    this.loggers.clear();
  }

  /**
   * Get or create a logger instance
   */
  getLogger(name: string): Logger {
    // Check cache first
    if (this.loggers.has(name)) {
      const logger = this.loggers.get(name);
      if (!logger) {
        throw new Error(`Logger '${name}' not found in cache`);
      }
      return logger;
    }

    // Create logger using factory or default
    let logger: Logger;
    if (this.config.loggerFactory) {
      logger = this.config.loggerFactory(name);
    } else if (this.config.defaultLogger) {
      logger = this.config.defaultLogger;
    } else {
      logger = new ConsoleLogger(name);
    }

    // Cache and return
    this.loggers.set(name, logger);
    return logger;
  }

  /**
   * Reset factory to default state
   */
  reset(): void {
    this.config = {};
    this.loggers.clear();
  }
}

// Export singleton instance
export const loggerFactory = new LoggerFactory();

/**
 * Convenience function to get a logger
 */
export function getLogger(name: string): Logger {
  return loggerFactory.getLogger(name);
}

/**
 * Configure the global logger factory
 * This should be called once at application startup
 *
 * Example usage:
 * ```typescript
 * // In your service initialization
 * import { configureLogging } from '@inkeep/agents-core';
 * import { getLogger as getPinoLogger } from './logger.j';
 *
 * configureLogging({
 *   loggerFactory: (name) => getPinoLogger(name)
 * });
 * ```
 */
export function configureLogging(config: LoggerFactoryConfig): void {
  loggerFactory.configure(config);
}
