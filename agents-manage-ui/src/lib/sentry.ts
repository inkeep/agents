/**
 * Sentry wrapper that no-ops when NEXT_PUBLIC_SENTRY_DSN is not configured.
 *
 * Usage:
 *   import { sentry } from '@/lib/sentry';
 *   sentry.captureException(error);
 *   sentry.setUser({ id: 'user-123' });
 *   const eventId = sentry.captureException(error); // Returns actual event ID
 *
 * All Sentry methods are available and type-safe. Calls are no-ops if Sentry is not configured.
 */

type SentryModule = typeof import('@sentry/nextjs');

const sentryModule: SentryModule | null = process.env.NEXT_PUBLIC_SENTRY_DSN
  ? await import('@sentry/nextjs')
  : null;

/**
 * Proxy-based Sentry wrapper that automatically forwards all method calls.
 * No-ops gracefully when NEXT_PUBLIC_SENTRY_DSN is not configured.
 * Returns actual values from Sentry methods (e.g., event IDs from captureException).
 */
export const sentry = new Proxy({} as SentryModule, {
  get(_, prop: keyof SentryModule) {
    if (!sentryModule) {
      // Return a no-op function for methods, undefined for properties
      return typeof prop === 'string' ? () => undefined : undefined;
    }
    return sentryModule[prop];
  },
});

/**
 * Check if Sentry is configured.
 */
export function isSentryConfigured(): boolean {
  return !!process.env.NEXT_PUBLIC_SENTRY_DSN;
}
