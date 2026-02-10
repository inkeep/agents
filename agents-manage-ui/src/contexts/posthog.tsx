'use client';

import type * as PostHogReact from '@posthog/react';
import type { PostHog as PostHogClient } from 'posthog-js';
import { createContext, use, useEffect, useState } from 'react';
import { useRuntimeConfig } from '@/contexts/runtime-config';
import { REPLAY_UNMASK_SELECTOR_STRING } from '@/lib/replay-privacy';

type PosthogModules = {
  posthog: PostHogClient;
  PostHogProvider: typeof PostHogReact.PostHogProvider;
};

const PostHogContext = createContext<PostHogClient | null>(null);

export function usePostHog() {
  return use(PostHogContext);
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  const { PUBLIC_POSTHOG_KEY, PUBLIC_POSTHOG_HOST, PUBLIC_POSTHOG_SITE_TAG } = useRuntimeConfig();
  const [modules, setModules] = useState<PosthogModules | null>(null);

  useEffect(() => {
    if (!PUBLIC_POSTHOG_KEY) return;

    let cancelled = false;

    (async () => {
      try {
        const [{ default: posthog }, { PostHogProvider }] = await Promise.all([
          import('posthog-js'),
          import('@posthog/react'),
        ]);

        if (cancelled) return;

        if (!posthog.__loaded) {
          posthog.init(PUBLIC_POSTHOG_KEY, {
            api_host: PUBLIC_POSTHOG_HOST,
            defaults: '2025-11-30',
            enable_recording_console_log: true,

            // Session recording privacy: mask all text by default,
            // then selectively unmask static UI chrome.
            // PostHog does NOT mask text by default (unlike Sentry), so we
            // opt-in to masking and use maskTextFn to reveal safe elements.
            // Selectors defined in @/lib/replay-privacy.ts (shared with Sentry).
            session_recording: {
              maskAllInputs: true,
              maskTextSelector: '*',
              maskTextFn: (text, element) => {
                // Don't mask whitespace-only text (preserves layout)
                if (!text.trim()) return text;

                // Unmask static UI chrome that doesn't contain user PII.
                if (element?.closest?.(REPLAY_UNMASK_SELECTOR_STRING)) {
                  return text;
                }

                return '*'.repeat(text.length);
              },
            },
          });

          if (PUBLIC_POSTHOG_SITE_TAG) {
            posthog.register({ site: PUBLIC_POSTHOG_SITE_TAG });
          }
        }

        setModules({ posthog, PostHogProvider });
      } catch {
        console.warn('PostHog packages not installed, analytics disabled');
        // PostHog packages not installed, analytics disabled
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [PUBLIC_POSTHOG_KEY, PUBLIC_POSTHOG_HOST, PUBLIC_POSTHOG_SITE_TAG]);

  // Analytics disabled → behave like a passthrough provider
  if (!PUBLIC_POSTHOG_KEY || !modules) {
    return children;
  }

  const { posthog, PostHogProvider: PHProvider } = modules;

  return (
    <PostHogContext value={posthog}>
      <PHProvider client={posthog}>{children}</PHProvider>
    </PostHogContext>
  );
}
