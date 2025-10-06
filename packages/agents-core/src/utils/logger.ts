import type {
  LoggerOptions,
  Logger as PinoLoggerInstance,
  TransportMultiOptions,
  TransportSingleOptions,
} from 'pino';
import pino from 'pino';
import pinoPretty from 'pino-pretty';

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
export class PinoLogger {
  private transportConfigs: TransportSingleOptions[] = [];

  private pinoInstance: PinoLoggerInstance;
  private options: LoggerOptions;

  constructor(
    private name: string,
    config: PinoLoggerConfig = {}
  ) {
    this.options = {
      name: this.name,
      level: process.env.LOG_LEVEL || 'info',
      serializers: {
        obj: (value: any) => ({ ...value }),
      },
      redact: ['req.headers.authorization', 'req.headers["x-inkeep-admin-authentication"]'],
      ...config.options,
    };

    // Initialize transports array
    if (config.transportConfigs) {
      this.transportConfigs = config.transportConfigs;
    }

    if (process.env.VERCEL) {
      this.pinoInstance = pino(this.options, pino.destination({ sync: true }));
      console.log('Vercel detected, using sync transport');
    } else if (this.transportConfigs.length > 0) {
      this.pinoInstance = pino(this.options, pino.transport({ targets: this.transportConfigs }));
    } else {
      // Use pino-pretty stream directly instead of transport
      try {
        const prettyStream = pinoPretty({
          colorize: true,
          translateTime: 'HH:MM:ss',
          ignore: 'pid,hostname',
        });

        this.pinoInstance = pino(this.options, prettyStream);
      } catch (error) {
        // Fall back to standard pino if pino-pretty fails
        console.warn('Warning: pino-pretty failed, using standard JSON output:', error);
        this.pinoInstance = pino(this.options);
      }
    }
  }

  /**
   * Recreate the pino instance with current transports
   */
  private recreateInstance(): void {
    if (this.pinoInstance && typeof this.pinoInstance.flush === 'function') {
      this.pinoInstance.flush();
    }

    if (process.env.VERCEL) {
      this.pinoInstance = pino(this.options, pino.destination({ sync: true }));
      console.log('Vercel detected, using sync transport');
    } else if (this.transportConfigs.length === 0) {
      // Use pino-pretty stream directly instead of transport (same as constructor)
      try {
        const prettyStream = pinoPretty({
          colorize: true,
          translateTime: 'HH:MM:ss',
          ignore: 'pid,hostname',
        });

        this.pinoInstance = pino(this.options, prettyStream);
      } catch (error) {
        // Fall back to standard pino if pino-pretty fails
        console.warn('Warning: pino-pretty failed, using standard JSON output:', error);
        this.pinoInstance = pino(this.options);
      }
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
