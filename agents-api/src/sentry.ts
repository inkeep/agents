import { createRequire } from 'node:module';
import { env } from './env';

type SentryModule = typeof import('@sentry/node');

const require = createRequire(import.meta.url);

let sentryModule: SentryModule | null = null;

if (env.SENTRY_DSN) {
  try {
    const Sentry = require('@sentry/node') as SentryModule;
    Sentry.init({
      dsn: env.SENTRY_DSN,
      environment: env.ENVIRONMENT || 'development',
      skipOpenTelemetrySetup: true,
      tracesSampleRate: 0,
      sendDefaultPii: true,
    });
    sentryModule = Sentry;
  } catch {
    // @sentry/node is an optional dependency — silently no-op if not installed
  }
}

export const sentry = new Proxy({} as SentryModule, {
  get(_, prop: keyof SentryModule) {
    if (!sentryModule) {
      return typeof prop === 'string' ? () => undefined : undefined;
    }
    return sentryModule[prop];
  },
});
