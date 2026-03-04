type SentryModule = typeof import('@sentry/node');

let sentryModule: SentryModule | null = null;

if (process.env.SENTRY_DSN) {
  try {
    const Sentry = await import('@sentry/node');
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.ENVIRONMENT || 'development',
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
