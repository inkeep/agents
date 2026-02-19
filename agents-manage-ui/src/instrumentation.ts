import type * as SentryNs from '@sentry/nextjs';

export let onRequestError: typeof SentryNs.captureRequestError;

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./otel');
  }

  if (process.env.NEXT_PUBLIC_SENTRY_DSN && process.env.NEXT_RUNTIME === 'edge') {
    // Configures the initialization of Sentry for edge features (middleware, edge routes, and so on).
    // The config you add here will be used whenever one of the edge features is loaded.
    // Note that this config is unrelated to the Vercel Edge Runtime and is also required when running locally.
    // https://docs.sentry.io/platforms/javascript/guides/nextjs/

    const Sentry = await import('@sentry/nextjs');
    onRequestError = Sentry.captureRequestError;

    Sentry.init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

      // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
      tracesSampleRate: 1,

      // Enable logs to be sent to Sentry
      enableLogs: true,

      // Enable sending user PII (Personally Identifiable Information)
      // https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/options/#sendDefaultPii
      sendDefaultPii: true,
    });
  }
}
