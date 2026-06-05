import { describe, expect, it } from 'vitest';
import { buildCsp } from '../proxy';

const baseConfig = {
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
} satisfies Parameters<typeof buildCsp>[0];

function getDirective(csp: string, name: string): string {
  const directive = csp.split('; ').find((part) => part.startsWith(`${name} `));
  return directive ?? '';
}

describe('buildCsp reCAPTCHA conditional', () => {
  it('includes Google reCAPTCHA origins in script-src when site key is set', () => {
    const csp = buildCsp({ ...baseConfig, PUBLIC_INKEEP_RECAPTCHA_SITE_KEY: 'a-site-key' });
    const scriptSrc = getDirective(csp, 'script-src');
    expect(scriptSrc).toContain('https://www.google.com/recaptcha/');
    expect(scriptSrc).toContain('https://www.gstatic.com/recaptcha/');
  });

  it('includes Google reCAPTCHA origin in frame-src when site key is set', () => {
    const csp = buildCsp({ ...baseConfig, PUBLIC_INKEEP_RECAPTCHA_SITE_KEY: 'a-site-key' });
    const frameSrc = getDirective(csp, 'frame-src');
    expect(frameSrc).toContain('https://www.google.com/recaptcha/');
  });

  it('excludes Google reCAPTCHA origins from script-src when site key is empty', () => {
    const csp = buildCsp({ ...baseConfig, PUBLIC_INKEEP_RECAPTCHA_SITE_KEY: '' });
    const scriptSrc = getDirective(csp, 'script-src');
    expect(scriptSrc).not.toContain('recaptcha');
    expect(scriptSrc).not.toContain('gstatic');
  });

  it('excludes Google reCAPTCHA origin from frame-src when site key is empty', () => {
    const csp = buildCsp({ ...baseConfig, PUBLIC_INKEEP_RECAPTCHA_SITE_KEY: '' });
    const frameSrc = getDirective(csp, 'frame-src');
    expect(frameSrc).not.toContain('recaptcha');
  });

  it('allowlists reCAPTCHA in connect-src when site key is set (client telemetry XHRs to api2/clr)', () => {
    const cspWithKey = buildCsp({ ...baseConfig, PUBLIC_INKEEP_RECAPTCHA_SITE_KEY: 'a-site-key' });
    const cspWithoutKey = buildCsp({ ...baseConfig, PUBLIC_INKEEP_RECAPTCHA_SITE_KEY: '' });
    expect(getDirective(cspWithKey, 'connect-src')).toContain('https://www.google.com/recaptcha/');
    expect(getDirective(cspWithoutKey, 'connect-src')).not.toContain('recaptcha');
  });
});
