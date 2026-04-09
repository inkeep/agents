import { AsyncLocalStorage } from 'node:async_hooks';
import type {
  LoggerOptions,
  Logger as PinoLoggerInstance,
  TransportMultiOptions,
  TransportSingleOptions,
} from 'pino';
import pino from 'pino';
import pinoPretty from 'pino-pretty';
import { OTelLogStream } from './otel-log-stream';

function shouldColorize(): boolean {
  if (process.env.NO_COLOR && process.env.NO_COLOR !== '') {
    return false;
  }
  return process.stdout.isTTY ?? false;
}

function isStructuredMode(): boolean {
  return !!(process.env.VERCEL || process.env.NODE_ENV === 'production');
}

const loggerStorage = new AsyncLocalStorage<PinoLoggerInstance>();

export function runWithLogContext<T>(bindings: Record<string, unknown>, fn: () => T): T {
  const parent = loggerStorage.getStore() ?? basePinoInstance;
  const child = parent.child(bindings);
  return loggerStorage.run(child, fn);
}

let basePinoInstance: PinoLoggerInstance = pino({ level: 'silent' });

function setBasePinoInstance(instance: PinoLoggerInstance): void {
  basePinoInstance = instance;
}

/**
 * Configuration options for PinoLogger
 */
export interface PinoLoggerConfig {
  /** Pino logger options */
  options?: LoggerOptions;
  /** Pino transport configuration */
  transportConfigs?: TransportSingleOptions[];
  /** Pre-built pino instance (used internally by .with()) */
  fromInstance?: PinoLoggerInstance;
  /** When true, disables ALS proxying (used by .with() for snapshot semantics) */
  snapshot?: boolean;
}

/**
 * Pino logger implementation with transport customization support
 */
export class PinoLogger {
  private transportConfigs: TransportSingleOptions[] = [];

  private pinoInstance: PinoLoggerInstance;
  private options: LoggerOptions;
  private alsChildCache = new WeakMap<PinoLoggerInstance, PinoLoggerInstance>();
  private isSnapshot: boolean;

  constructor(
    private name: string,
    config: PinoLoggerConfig = {}
  ) {
    if (config.fromInstance) {
      this.pinoInstance = config.fromInstance;
      this.options = {};
      this.isSnapshot = config.snapshot ?? false;
      if (!this.isSnapshot) {
        setBasePinoInstance(this.pinoInstance);
      }
      return;
    }

    this.isSnapshot = false;
    this.options = {
      name: this.name,
      level: process.env.LOG_LEVEL || (process.env.ENVIRONMENT === 'test' ? 'silent' : 'info'),
      serializers: {
        err: pino.stdSerializers.err,
        error: pino.stdSerializers.err,
        obj: (value: any) => ({ ...value }),
      },
      redact: [
        'req.headers.authorization',
        'req.headers["x-inkeep-admin-authentication"]',
        'req.headers.cookie',
        'req.headers["x-forwarded-cookie"]',
      ],
      ...config.options,
    };

    // Initialize transports array
    if (config.transportConfigs) {
      this.transportConfigs = config.transportConfigs;
    }

    if (this.transportConfigs.length > 0) {
      this.pinoInstance = pino(this.options, pino.transport({ targets: this.transportConfigs }));
    } else if (isStructuredMode()) {
      const streams: pino.StreamEntry[] = [
        { level: (this.options.level ?? 'info') as pino.Level, stream: process.stdout },
        { level: (this.options.level ?? 'info') as pino.Level, stream: new OTelLogStream() },
      ];
      this.pinoInstance = pino(this.options, pino.multistream(streams));
    } else {
      try {
        const prettyStream = pinoPretty({
          colorize: shouldColorize(),
          translateTime: 'HH:MM:ss',
          ignore: 'pid,hostname',
        });
        this.pinoInstance = pino(this.options, prettyStream);
      } catch (error) {
        console.warn('Warning: pino-pretty failed, using standard JSON output:', error);
        this.pinoInstance = pino(this.options);
      }
    }

    setBasePinoInstance(this.pinoInstance);
  }

  /**
   * Recreate the pino instance with current transports
   */
  private recreateInstance(): void {
    if (this.pinoInstance && typeof this.pinoInstance.flush === 'function') {
      this.pinoInstance.flush();
    }

    this.alsChildCache = new WeakMap();

    if (this.transportConfigs.length > 0) {
      const multiTransport: TransportMultiOptions = { targets: this.transportConfigs };
      const pinoTransport = pino.transport(multiTransport);
      this.pinoInstance = pino(this.options, pinoTransport);
    } else if (isStructuredMode()) {
      const streams: pino.StreamEntry[] = [
        { level: (this.options.level ?? 'info') as pino.Level, stream: process.stdout },
        { level: (this.options.level ?? 'info') as pino.Level, stream: new OTelLogStream() },
      ];
      this.pinoInstance = pino(this.options, pino.multistream(streams));
    } else {
      try {
        const prettyStream = pinoPretty({
          colorize: shouldColorize(),
          translateTime: 'HH:MM:ss',
          ignore: 'pid,hostname',
        });
        this.pinoInstance = pino(this.options, prettyStream);
      } catch (error) {
        console.warn('Warning: pino-pretty failed, using standard JSON output:', error);
        this.pinoInstance = pino(this.options);
      }
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

  private resolveInstance(): PinoLoggerInstance {
    if (this.isSnapshot) return this.pinoInstance;
    const alsInstance = loggerStorage.getStore();
    if (!alsInstance) return this.pinoInstance;

    let cached = this.alsChildCache.get(alsInstance);
    if (!cached) {
      cached = alsInstance.child({ module: this.name });
      this.alsChildCache.set(alsInstance, cached);
    }
    return cached;
  }

  /**
   * Creates a new PinoLogger with the given bindings baked in (snapshot semantics).
   * Captures the current ALS context at call time. The returned logger does NOT
   * pick up subsequent ALS context changes — use for class member loggers that
   * are constructed once and reused within a request scope.
   */
  with(bindings: Record<string, unknown>): PinoLogger {
    return new PinoLogger(this.name, {
      fromInstance: this.resolveInstance().child(bindings),
      snapshot: true,
    });
  }

  child(bindings: Record<string, unknown>): PinoLogger {
    return this.with(bindings);
  }

  error(message: string): void;
  error(data: any, message: string): void;
  error(dataOrMessage: any, message?: string): void {
    if (message === undefined) {
      this.resolveInstance().error(dataOrMessage);
    } else {
      this.resolveInstance().error(dataOrMessage, message);
    }
  }

  warn(message: string): void;
  warn(data: any, message: string): void;
  warn(dataOrMessage: any, message?: string): void {
    if (message === undefined) {
      this.resolveInstance().warn(dataOrMessage);
    } else {
      this.resolveInstance().warn(dataOrMessage, message);
    }
  }

  info(message: string): void;
  info(data: any, message: string): void;
  info(dataOrMessage: any, message?: string): void {
    if (message === undefined) {
      this.resolveInstance().info(dataOrMessage);
    } else {
      this.resolveInstance().info(dataOrMessage, message);
    }
  }

  debug(message: string): void;
  debug(data: any, message: string): void;
  debug(dataOrMessage: any, message?: string): void {
    if (message === undefined) {
      this.resolveInstance().debug(dataOrMessage);
    } else {
      this.resolveInstance().debug(dataOrMessage, message);
    }
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
