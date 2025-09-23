import type { DestinationStream, LoggerOptions, Logger as PinoLoggerInstance } from 'pino';

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
  /** Custom destination stream (use this OR transport, not both) */
  destination?: DestinationStream;
  /** Pino transport configuration */
  transport?: any; // pino.TransportSingleOptions | pino.TransportMultiOptions
}

/**
 * Pino logger implementation with transport customization support
 */
export class PinoLogger implements Logger {
  private pinoInstance: PinoLoggerInstance;
  private pino: any;

  constructor(
    private name: string,
    config: PinoLoggerConfig = {}
  ) {
    this.pino = this.requirePino();

    const defaultOptions: LoggerOptions = {
      name: this.name,
      level: 'debug',
      ...config.options,
    };

    // Create pino instance based on configuration
    if (config.transport) {
      // Use pino transport (like pino-sentry-transport)
      const transport = this.pino.transport(config.transport);
      this.pinoInstance = this.pino(defaultOptions, transport);
    } else if (config.destination) {
      // Use custom destination stream
      this.pinoInstance = this.pino(defaultOptions, config.destination);
    } else {
      // Default pino instance
      this.pinoInstance = this.pino(defaultOptions);
    }
  }

  private requirePino() {
    try {
      // Dynamic import to avoid bundling issues
      return require('pino');
    } catch (error) {
      throw new Error('Pino is required for PinoLogger. Install with: npm install pino');
    }
  }

  /**
   * Update the transport/destination after logger creation
   * This creates a new pino instance with the new transport
   */
  updateTransport(
    transportOrDestination: any | DestinationStream,
    options?: Partial<LoggerOptions>
  ): void {
    const currentOptions = this.pinoInstance.bindings();

    const newOptions: LoggerOptions = {
      name: this.name,
      level: this.pinoInstance.level,
      ...currentOptions,
      ...options,
    };

    // Check if it's a transport config object or destination stream
    if (
      transportOrDestination &&
      typeof transportOrDestination === 'object' &&
      'target' in transportOrDestination
    ) {
      // It's a transport configuration
      const transport = this.pino.transport(transportOrDestination);
      this.pinoInstance = this.pino(newOptions, transport);
    } else {
      // It's a destination stream
      this.pinoInstance = this.pino(newOptions, transportOrDestination);
    }
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
  defaultLogger?: Logger;
  loggerFactory?: (name: string) => Logger;
  /** Configuration for creating PinoLogger instances when using createPinoLoggerFactory */
  pinoConfig?: PinoLoggerConfig;
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
