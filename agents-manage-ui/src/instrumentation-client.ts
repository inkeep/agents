// This file configures the initialization of Sentry on the client.
// The added config here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import type * as SentryNs from '@sentry/nextjs';
import { REPLAY_UNBLOCK_SELECTORS, REPLAY_UNMASK_SELECTORS } from '@/lib/replay-privacy';

export let onRouterTransitionStart: typeof SentryNs.captureRouterTransitionStart;

if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  const Sentry = await import('@sentry/nextjs');
  onRouterTransitionStart = Sentry.captureRouterTransitionStart;

  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

    // Add optional integrations for additional features
    integrations: [
      Sentry.replayIntegration({
        // Keep maskAllText: true (default) so all text is masked by default.
        // Keep maskAllInputs: true (default) so form inputs stay masked.
        // Keep blockAllMedia: true (default) so media is blocked by default.

        // Unmask static UI chrome that doesn't contain user-generated PII.
        // Selectors defined in @/lib/replay-privacy.ts (shared with PostHog).
        unmask: [...REPLAY_UNMASK_SELECTORS],

        // Unblock SVG icons in UI chrome so layout and iconography are visible.
        unblock: [...REPLAY_UNBLOCK_SELECTORS],
      }),
    ],

    // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
    tracesSampleRate: 1,
    // Enable logs to be sent to Sentry
    enableLogs: true,

    // Define how likely Replay events are sampled.
    // This sets the sample rate to be 10%. You may want this to be 100% while
    // in development and sample at a lower rate in production
    replaysSessionSampleRate: 0.1,

    // Define how likely Replay events are sampled when an error occurs.
    replaysOnErrorSampleRate: 1.0,

    // Enable sending user PII (Personally Identifiable Information)
    // https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/options/#sendDefaultPii
    sendDefaultPii: true,
  });
}
