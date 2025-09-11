import { AsyncLocalStorage } from 'node:async_hooks';
import type { Next } from 'hono';
import { pino } from 'pino';
import { env } from './env';



// Create logger configuration based on environment
const isDevelopment = env.ENVIRONMENT === 'development';

const loggerConfig = {
  level: env.LOG_LEVEL,
  serializers: {
    obj: (value: any) => ({ ...value }),
  },
  redact: ['req.headers.authorization', 'req.headers["x-inkeep-admin-authentication"]'],
  // Only use pino-pretty in development
  ...(isDevelopment && {
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

const logger = pino(loggerConfig);

const asyncLocalStorage = new AsyncLocalStorage<Map<string, string>>();

export function getLogger(name?: string) {
  const store = asyncLocalStorage.getStore();
  const reqId = store?.get('requestId') || undefined;
  if (!reqId) {
    return logger.child({ name });
  }
  return logger.child({ reqId, name });
}

export function withRequestContext(reqId: string, fn: Next) {
  return asyncLocalStorage.run(new Map([['requestId', reqId]]), fn);
}
