'use client';

import posthog from 'posthog-js';

if (typeof window !== 'undefined') {
  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY || '', {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com',
    capture_pageview: false,
    person_profiles: 'always',
    disable_surveys: true,
    disable_external_dependency_loading: true,
    loaded: (posthog) => {
      posthog.register({
        site: 'agents-docs',
      });

      if (process.env.NODE_ENV === 'development') {
        console.log('[PostHog] Initialized successfully');
      }
    },
    session_recording: {
      maskAllInputs: true,
      maskTextFn: (text, element) => {
        if (element?.dataset.demo === 'true') {
          return text;
        }
        return '*'.repeat(text.length);
      },
      maskTextSelector: '*',
    },
  });
}
