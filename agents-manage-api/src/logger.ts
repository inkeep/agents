import { AsyncLocalStorage } from 'node:async_hooks';
import type { Next } from 'hono';
import { pino } from 'pino';
// import { createGcpLoggingPinoConfig } from '@google-cloud/pino-logging-gcp-config';
import { env } from './env.js';

const logger = pino({
  level: env.LOG_LEVEL,
  serializers: {
    obj: (value) => ({ ...value }),
  },
  redact: ['req.headers.authorization', 'req.headers["x-inkeep-admin-authentication"]'],
  transport: {
    target: 'pino-pretty',
    options: {
      sync: true,
      destination: 1, // stdout
      colorize: true,
      translateTime: 'SYS:standard',
    },
  },
});

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
