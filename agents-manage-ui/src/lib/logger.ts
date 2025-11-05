import { AsyncLocalStorage } from 'node:async_hooks';
import { pino } from 'pino';

// Environment configuration for Next.js
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const NODE_ENV = process.env.NODE_ENV || 'development';

const logger = pino({
  level: LOG_LEVEL,
  serializers: {
    obj: (value) => ({ ...value }),
  },
  redact: ['req.headers.authorization', 'req.headers["x-inkeep-admin-authentication"]'],
  // Only use pretty transport in development
  ...(NODE_ENV === 'development' && {
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

function withRequestContext<T>(reqId: string, fn: () => T): T {
  return asyncLocalStorage.run(new Map([['requestId', reqId]]), fn);
}
