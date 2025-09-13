import { AsyncLocalStorage } from 'node:async_hooks';
import type { Next } from 'hono';
import { pino, type Logger as PinoLogger } from 'pino';
import type { Logger } from './logger';

/**
 * Configuration options for creating a Pino logger
 */
export interface PinoLoggerConfig {
  level?: string;
  environment?: string;
  redact?: string[];
  prettyPrint?: boolean;
}

/**
 * AsyncLocalStorage for request context
 */
const asyncLocalStorage = new AsyncLocalStorage<Map<string, string>>();

/**
 * Creates a configured Pino logger instance
 */
export function createPinoLogger(config: PinoLoggerConfig = {}): PinoLogger {
  const {
    level = 'info',
    environment = process.env.NODE_ENV || 'development',
    redact = ['req.headers.authorization', 'req.headers["x-inkeep-admin-authentication"]'],
    prettyPrint = environment === 'development',
  } = config;

  const loggerConfig = {
    level,
    serializers: {
      obj: (value: any) => ({ ...value }),
    },
    redact,
    // Only use pino-pretty in development
    ...(prettyPrint && {
      transport: {
        target: 'pino-pretty',
        options: {
          sync: true,
          destination: 1, // stdout
          colorize: true,
          translateTime: 'SYS:standard',
        },
      },
    }),
  };

  return pino(loggerConfig);
}

/**
 * Creates a Pino logger factory function for use with configureLogging
 */
export function createPinoLoggerFactory(baseLogger: PinoLogger): (name: string) => Logger {
  return (name: string): Logger => {
    const store = asyncLocalStorage.getStore();
    const reqId = store?.get('requestId') || undefined;
    
    if (reqId) {
      return baseLogger.child({ reqId, name });
    }
    return baseLogger.child({ name });
  };
}

/**
 * Middleware to add request context for Hono
 */
export function withRequestContext(reqId: string, fn: Next) {
  return asyncLocalStorage.run(new Map([['requestId', reqId]]), fn);
}

/**
 * Generic function to run code with request context
 */
export function runWithRequestContext<T>(reqId: string, fn: () => T): T {
  return asyncLocalStorage.run(new Map([['requestId', reqId]]), fn);
}

/**
 * Gets the current request ID from async context
 */
export function getCurrentRequestId(): string | undefined {
  const store = asyncLocalStorage.getStore();
  return store?.get('requestId');
}