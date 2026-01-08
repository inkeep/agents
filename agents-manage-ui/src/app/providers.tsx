'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { useRuntimeConfig } from '@/contexts/runtime-config-context';
import type * as PostHogReact from '@posthog/react';
import type { PostHog } from 'posthog-js';

type PosthogModules = {
  posthog: PostHog;
  PostHogProvider: typeof PostHogReact.PostHogProvider;
};

const PostHogContext = createContext<PostHog | null>(null);

export function usePostHog() {
  return useContext(PostHogContext);
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
          });

          if (PUBLIC_POSTHOG_SITE_TAG) {
            posthog.register({
              site: PUBLIC_POSTHOG_SITE_TAG,
            });
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
    return <PostHogContext value={null}>{children}</PostHogContext>;
  }

  const { posthog, PostHogProvider: PHProvider } = modules;

  return (
    <PostHogContext value={posthog}>
      <PHProvider client={posthog}>{children}</PHProvider>
    </PostHogContext>
  );
}
