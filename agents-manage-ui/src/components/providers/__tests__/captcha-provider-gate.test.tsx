// @vitest-environment jsdom
import { cleanup, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RuntimeConfigProvider } from '@/contexts/runtime-config';

const pathnameRef = { value: '/login' };

vi.mock('next/navigation', () => ({
  usePathname: () => pathnameRef.value,
}));

import { useCaptchaExecutor } from '../captcha-provider-gate';

type RuntimeConfig = Parameters<typeof RuntimeConfigProvider>[0]['value'];

function wrapperFor(value: Partial<RuntimeConfig>) {
  const config = {
    PUBLIC_INKEEP_AGENTS_RUN_API_BYPASS_SECRET: undefined,
    PUBLIC_INKEEP_AGENTS_API_URL: 'http://localhost:3002',
    PUBLIC_SIGNOZ_URL: 'http://localhost:3301',
    PUBLIC_NANGO_SERVER_URL: 'http://localhost:3003',
    PUBLIC_NANGO_CONNECT_BASE_URL: 'http://localhost:3004',
    PUBLIC_INKEEP_COPILOT_APP_ID: undefined,
    PUBLIC_GOOGLE_CLIENT_ID: undefined,
    PUBLIC_MICROSOFT_CLIENT_ID: undefined,
    PUBLIC_IS_INKEEP_CLOUD_DEPLOYMENT: 'false',
    PUBLIC_INKEEP_RECAPTCHA_SITE_KEY: '',
    PUBLIC_POSTHOG_KEY: undefined,
    PUBLIC_POSTHOG_HOST: undefined,
    PUBLIC_POSTHOG_SITE_TAG: undefined,
    PUBLIC_IS_SMTP_CONFIGURED: undefined,
    ...value,
  } as RuntimeConfig;
  return ({ children }: { children: ReactNode }) => (
    <RuntimeConfigProvider value={config}>{children}</RuntimeConfigProvider>
  );
}

describe('useCaptchaExecutor', () => {
  beforeEach(() => {
    pathnameRef.value = '/login';
  });
  afterEach(cleanup);

  it('returns undefined when not a cloud deployment so optional-chain calls do not throw', () => {
    const wrapper = wrapperFor({
      PUBLIC_IS_INKEEP_CLOUD_DEPLOYMENT: 'false',
      PUBLIC_INKEEP_RECAPTCHA_SITE_KEY: 'a-site-key',
    });
    const { result } = renderHook(() => useCaptchaExecutor(), { wrapper });
    expect(result.current).toBeUndefined();
  });

  it('returns undefined when the site key is empty', () => {
    const wrapper = wrapperFor({
      PUBLIC_IS_INKEEP_CLOUD_DEPLOYMENT: 'true',
      PUBLIC_INKEEP_RECAPTCHA_SITE_KEY: '',
    });
    const { result } = renderHook(() => useCaptchaExecutor(), { wrapper });
    expect(result.current).toBeUndefined();
  });

  it('returns undefined when not on an auth path', () => {
    pathnameRef.value = '/projects';
    const wrapper = wrapperFor({
      PUBLIC_IS_INKEEP_CLOUD_DEPLOYMENT: 'true',
      PUBLIC_INKEEP_RECAPTCHA_SITE_KEY: 'a-site-key',
    });
    const { result } = renderHook(() => useCaptchaExecutor(), { wrapper });
    expect(result.current).toBeUndefined();
  });

  it('does not invoke the library default throwing function on non-cloud deployments', async () => {
    // The react-google-recaptcha-v3 default context provides `executeRecaptcha`
    // as a function that throws ("GoogleReCaptcha Context has not yet been
    // implemented..."). Optional-chain (`?.()`) does NOT short-circuit on a
    // truthy throwing function. This regression test pins that the safe
    // wrapper returns undefined in that case, so call sites using
    // `await result?.('action')` never reach the throw.
    const wrapper = wrapperFor({
      PUBLIC_IS_INKEEP_CLOUD_DEPLOYMENT: 'false',
      PUBLIC_INKEEP_RECAPTCHA_SITE_KEY: 'a-site-key',
    });
    const { result } = renderHook(() => useCaptchaExecutor(), { wrapper });
    expect(() => result.current?.('login')).not.toThrow();
    expect(await result.current?.('login')).toBeUndefined();
  });
});
