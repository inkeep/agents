// @vitest-environment jsdom
import { cleanup, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RuntimeConfigProvider } from '@/contexts/runtime-config';

const pathnameRef = { value: '/login' };

vi.mock('next/navigation', () => ({
  usePathname: () => pathnameRef.value,
}));

const mockedExecuteRecaptcha = vi.fn().mockResolvedValue('mock-token');

vi.mock('react-google-recaptcha-v3', () => ({
  GoogleReCaptchaProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useGoogleReCaptcha: () => ({ executeRecaptcha: mockedExecuteRecaptcha }),
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

describe('useCaptchaExecutor with mounted provider', () => {
  beforeEach(() => {
    pathnameRef.value = '/login';
    mockedExecuteRecaptcha.mockClear();
  });
  afterEach(cleanup);

  it.each([
    ['/login'],
    ['/forgot-password'],
    ['/accept-invitation/abc-123'],
  ])('returns the executeRecaptcha function on cloud + valid key + auth path %s', (path) => {
    pathnameRef.value = path;
    const wrapper = wrapperFor({
      PUBLIC_IS_INKEEP_CLOUD_DEPLOYMENT: 'true',
      PUBLIC_INKEEP_RECAPTCHA_SITE_KEY: 'a-site-key',
    });
    const { result } = renderHook(() => useCaptchaExecutor(), { wrapper });
    expect(typeof result.current).toBe('function');
    expect(result.current).toBe(mockedExecuteRecaptcha);
  });

  it('the returned function resolves to a token when invoked', async () => {
    const wrapper = wrapperFor({
      PUBLIC_IS_INKEEP_CLOUD_DEPLOYMENT: 'true',
      PUBLIC_INKEEP_RECAPTCHA_SITE_KEY: 'a-site-key',
    });
    const { result } = renderHook(() => useCaptchaExecutor(), { wrapper });
    const token = await result.current?.('login');
    expect(token).toBe('mock-token');
    expect(mockedExecuteRecaptcha).toHaveBeenCalledWith('login');
  });
});
