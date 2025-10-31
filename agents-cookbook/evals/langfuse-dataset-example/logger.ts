/**
 * Logger interface for core package components
 * Allows services to inject their own logger implementation
 */
export interface Logger {
  error(data: any, message: string): void;
  warn(data: any, message: string): void;
  info(data: any, message: string): void;
  debug(data: any, message: string): void;
}

/**
 * Default console logger implementation
 */
export class ConsoleLogger implements Logger {
  constructor(private name: string) {}

  error(data: any, message: string): void {
    console.error(`[${this.name}] ${message}`, data);
  }

  warn(data: any, message: string): void {
    console.warn(`[${this.name}] ${message}`, data);
  }

  info(data: any, message: string): void {
    console.info(`[${this.name}] ${message}`, data);
  }

  debug(data: any, message: string): void {
    console.debug(`[${this.name}] ${message}`, data);
  }
}

/**
 * No-op logger that silently ignores all log calls
 */
export class NoOpLogger implements Logger {
  error(_data: any, _message: string): void {}
  warn(_data: any, _message: string): void {}
  info(_data: any, _message: string): void {}
  debug(_data: any, _message: string): void {}
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