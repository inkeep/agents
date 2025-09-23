import { createRequire } from 'module';
import type {
  LoggerOptions,
  Logger as PinoLoggerInstance,
  TransportMultiOptions,
  TransportSingleOptions,
} from 'pino';
import pino from 'pino';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);

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
 * Configuration options for PinoLogger
 */
export interface PinoLoggerConfig {
  /** Pino logger options */
  options?: LoggerOptions;
  /** Pino transport configuration */
  transportConfigs?: TransportSingleOptions[];
}

/**
 * Pino logger implementation with transport customization support
 */
export class PinoLogger implements Logger {
  private transportConfigs: TransportSingleOptions[] = [];

  private pinoInstance: PinoLoggerInstance;
  private options: LoggerOptions;

  constructor(
    private name: string,
    config: PinoLoggerConfig = {}
  ) {
    this.options = {
      name: this.name,
      level: 'debug',
      ...config.options,
    };

    // Initialize transports array
    if (config.transportConfigs) {
      this.transportConfigs = config.transportConfigs;
    }

    if (this.transportConfigs.length > 0) {
      this.pinoInstance = pino(this.options, pino.transport({ targets: this.transportConfigs }));
    } else {
      // Use pino-pretty as default with proper path resolution
      // try {
      const pinoPrettyPath = require.resolve('pino-pretty');
      const transportConfig = {
        target: pinoPrettyPath,
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss',
          ignore: 'pid,hostname',
        },
      };
      this.transportConfigs.push(transportConfig);
      this.pinoInstance = pino(this.options, pino.transport({ targets: this.transportConfigs }));
      // } catch (error) {
      //   // Fall back to standard pino if pino-pretty can't be resolved
      //   console.warn('Warning: pino-pretty not found, using standard JSON output.');
      //   this.pinoInstance = pino(this.options);
      // }
    }
  }

  /**
   * Recreate the pino instance with current transports
   */
  private recreateInstance(): void {
    if (this.transportConfigs.length === 0) {
      // Default pino instance
      this.pinoInstance = pino(this.options);
    } else {
      const multiTransport: TransportMultiOptions = { targets: this.transportConfigs };
      const pinoTransport = pino.transport(multiTransport);
      this.pinoInstance = pino(this.options, pinoTransport);
    }
  }

  /**
   * Add a new transport to the logger
   */
  addTransport(transportConfig: TransportSingleOptions): void {
    this.transportConfigs.push(transportConfig);
    this.recreateInstance();
  }

  /**
   * Remove a transport by index
   */
  removeTransport(index: number): void {
    if (index >= 0 && index < this.transportConfigs.length) {
      this.transportConfigs.splice(index, 1);
      this.recreateInstance();
    }
  }

  /**
   * Get current transports
   */
  getTransports(): TransportSingleOptions[] {
    return [...this.transportConfigs];
  }

  /**
   * Update logger options
   */
  updateOptions(options: Partial<LoggerOptions>): void {
    this.options = {
      ...this.options,
      ...options,
    };
    this.recreateInstance();
  }

  /**
   * Get the underlying pino instance for advanced usage
   */
  getPinoInstance(): PinoLoggerInstance {
    return this.pinoInstance;
  }

  error(data: any, message: string): void {
    this.pinoInstance.error(data, message);
  }

  warn(data: any, message: string): void {
    this.pinoInstance.warn(data, message);
  }

  info(data: any, message: string): void {
    this.pinoInstance.info(data, message);
  }

  debug(data: any, message: string): void {
    this.pinoInstance.debug(data, message);
  }
}

/**
 * Logger factory configuration
 */
export interface LoggerFactoryConfig {
  defaultLogger?: PinoLogger;
  loggerFactory?: (name: string) => PinoLogger;
  /** Configuration for creating PinoLogger instances when using createPinoLoggerFactory */
  pinoConfig?: PinoLoggerConfig;
}

/**
 * Global logger factory singleton
 */
class LoggerFactory {
  private config: LoggerFactoryConfig = {};
  private loggers = new Map<string, PinoLogger>();

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
  getLogger(name: string): PinoLogger {
    // Check cache first
    if (this.loggers.has(name)) {
      const logger = this.loggers.get(name);
      if (!logger) {
        throw new Error(`Logger '${name}' not found in cache`);
      }
      return logger;
    }

    // Create logger using factory or default
    let logger: PinoLogger;
    if (this.config.loggerFactory) {
      logger = this.config.loggerFactory(name);
    } else if (this.config.defaultLogger) {
      logger = this.config.defaultLogger;
    } else {
      // Default to PinoLogger instead of ConsoleLogger
      logger = new PinoLogger(name, this.config.pinoConfig);
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
export function getLogger(name: string): PinoLogger {
  return loggerFactory.getLogger(name);
}

/**
 * Create a factory function for PinoLogger instances
 */
export function createPinoLoggerFactory(
  config: PinoLoggerConfig = {}
): (name: string) => PinoLogger {
  return (name: string) => new PinoLogger(name, config);
}

/**
 * Configure the global logger factory
 * This should be called once at application startup
 *
 * Example usage:
 * ```typescript
 * // Basic pino usage
 * import { configureLogging, createPinoLoggerFactory } from '@inkeep/agents-core';
 *
 * configureLogging({
 *   loggerFactory: createPinoLoggerFactory()
 * });
 *
 * // With Sentry transport
 * configureLogging({
 *   loggerFactory: createPinoLoggerFactory({
 *     transport: {
 *       target: 'pino-sentry-transport',
 *       options: {
 *         sentry: {
 *           dsn: 'https://******@sentry.io/12345',
 *         }
 *       }
 *     }
 *   })
 * });
 *
 * // With multiple transports
 * configureLogging({
 *   loggerFactory: createPinoLoggerFactory({
 *     transport: {
 *       targets: [
 *         {
 *           target: 'pino-pretty',
 *           level: 'info',
 *           options: { colorize: true }
 *         },
 *         {
 *           target: 'pino-sentry-transport',
 *           level: 'error',
 *           options: {
 *             sentry: { dsn: 'https://******@sentry.io/12345' }
 *           }
 *         }
 *       ]
 *     }
 *   })
 * });
 *
 * // Custom logger implementation
 * configureLogging({
 *   loggerFactory: (name) => new CustomLogger(name)
 * });
 * ```
 */
export function configureLogging(config: LoggerFactoryConfig): void {
  loggerFactory.configure(config);
}
