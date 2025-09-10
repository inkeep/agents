import { pino } from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  serializers: {
    obj: (value: any) => ({ ...value }),
  },
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

export function getLogger(name?: string) {
  return logger.child({ name });
}
