'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { useRuntimeConfig } from '@/contexts/runtime-config-context';

type PostHogClient = {
  identify: (
    distinctId: string,
    userProperties?: Record<string, unknown>,
    userPropertiesOnce?: Record<string, unknown>
  ) => void;
  reset: () => void;
  capture: (event: string, properties?: Record<string, unknown>) => void;
};

type PosthogModules = {
  posthog: PostHogClient;
  PostHogProvider: React.ComponentType<{ client: any; children: React.ReactNode }>;
};

const PostHogContext = createContext<PostHogClient | null>(null);

export function usePostHog() {
  return useContext(PostHogContext);
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  const { PUBLIC_POSTHOG_KEY, PUBLIC_POSTHOG_HOST, PUBLIC_POSTHOG_SITE_TAG } = useRuntimeConfig();
  const ENABLE_POSTHOG = Boolean(PUBLIC_POSTHOG_KEY);
  const [modules, setModules] = useState<PosthogModules | null>(null);

  useEffect(() => {
    if (!ENABLE_POSTHOG) return;

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

          const siteTag = PUBLIC_POSTHOG_SITE_TAG;
          if (siteTag) {
            posthog.register({
              site: siteTag,
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
  }, [ENABLE_POSTHOG]);

  // Analytics disabled → behave like a passthrough provider
  if (!ENABLE_POSTHOG || !modules) {
    return <PostHogContext.Provider value={null}>{children}</PostHogContext.Provider>;
  }

  const { posthog, PostHogProvider: PHProvider } = modules;

  return (
    <PostHogContext.Provider value={posthog}>
      <PHProvider client={posthog}>{children}</PHProvider>
    </PostHogContext.Provider>
  );
}
