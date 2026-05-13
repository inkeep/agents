import { describe, expect, it } from 'vitest';
import { testRunDbClient } from '../../__tests__/setup';
import { createAuth } from '../auth';
import { checkPasswordPolicy } from '../password-policy';

describe('createAuth captcha plugin registration', () => {
  it('does not register the captcha plugin when recaptcha config is absent', () => {
    const auth = createAuth({
      baseURL: 'http://localhost:3002',
      secret: 'test-secret-test-secret-test-secret',
      dbClient: testRunDbClient,
    });

    const plugins = (auth as unknown as { options: { plugins: Array<{ id: string }> } }).options
      .plugins;
    const captchaPlugin = plugins.find((p) => p.id === 'captcha');
    expect(captchaPlugin).toBeUndefined();
  });

  it('registers the captcha plugin when recaptcha config is provided', () => {
    const auth = createAuth({
      baseURL: 'http://localhost:3002',
      secret: 'test-secret-test-secret-test-secret',
      dbClient: testRunDbClient,
      recaptcha: {
        secretKey: 'test-recaptcha-secret',
        minScore: 0.5,
      },
    });

    const plugins = (
      auth as unknown as {
        options: { plugins: Array<{ id: string; options?: { provider?: string } }> };
      }
    ).options.plugins;
    const captchaPlugin = plugins.find((p) => p.id === 'captcha');
    expect(captchaPlugin).toBeDefined();
    expect(captchaPlugin?.options?.provider).toBe('google-recaptcha');
  });

  it('uses default minScore 0.5 when recaptcha.minScore is omitted', () => {
    const auth = createAuth({
      baseURL: 'http://localhost:3002',
      secret: 'test-secret-test-secret-test-secret',
      dbClient: testRunDbClient,
      recaptcha: {
        secretKey: 'test-recaptcha-secret',
      },
    });

    const plugins = (
      auth as unknown as {
        options: { plugins: Array<{ id: string; options?: { minScore?: number } }> };
      }
    ).options.plugins;
    const captchaPlugin = plugins.find((p) => p.id === 'captcha');
    expect(captchaPlugin?.options?.minScore).toBe(0.5);
  });

  it('passes through a custom minScore', () => {
    const auth = createAuth({
      baseURL: 'http://localhost:3002',
      secret: 'test-secret-test-secret-test-secret',
      dbClient: testRunDbClient,
      recaptcha: {
        secretKey: 'test-recaptcha-secret',
        minScore: 0.3,
      },
    });

    const plugins = (
      auth as unknown as {
        options: { plugins: Array<{ id: string; options?: { minScore?: number } }> };
      }
    ).options.plugins;
    const captchaPlugin = plugins.find((p) => p.id === 'captcha');
    expect(captchaPlugin?.options?.minScore).toBe(0.3);
  });

  it.each([
    ['/api/auth/sign-in/email', { email: 'test@example.com', password: 'irrelevant' }],
    [
      '/api/auth/sign-up/email',
      { email: 'test@example.com', password: 'irrelevant', name: 'Tester' },
    ],
    ['/api/auth/request-password-reset', { email: 'test@example.com' }],
  ])('rejects POST %s with 400 MISSING_RESPONSE when the captcha header is absent', async (path, body) => {
    const auth = createAuth({
      baseURL: 'http://localhost:3002',
      secret: 'test-secret-test-secret-test-secret',
      dbClient: testRunDbClient,
      recaptcha: {
        secretKey: 'test-recaptcha-secret',
        minScore: 0.5,
      },
    });

    const response = await auth.handler(
      new Request(`http://localhost:3002${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    );

    expect(response.status).toBe(400);
    const responseBody = (await response.json()) as { code?: string };
    expect(responseBody.code).toBe('MISSING_RESPONSE');
  });

  it('does not require x-captcha-response when recaptcha is unset (kill-switch)', async () => {
    const auth = createAuth({
      baseURL: 'http://localhost:3002',
      secret: 'test-secret-test-secret-test-secret',
      dbClient: testRunDbClient,
    });

    const response = await auth.handler(
      new Request('http://localhost:3002/api/auth/sign-in/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'test@example.com', password: 'irrelevant' }),
      })
    );

    const body = (await response.json()) as { code?: string };
    expect(body.code).not.toBe('MISSING_RESPONSE');
  });
});

describe('checkPasswordPolicy', () => {
  it('does nothing for paths outside the password-policy guard list', async () => {
    await expect(
      checkPasswordPolicy({
        path: '/sign-in/email',
        body: { email: 'a@b.com', password: 'short' },
      })
    ).resolves.toBeUndefined();
  });

  it('does nothing when body is not a plain object', async () => {
    await expect(
      checkPasswordPolicy({
        path: '/sign-up/email',
        body: null,
      })
    ).resolves.toBeUndefined();
  });

  it('does nothing when body lacks password and newPassword fields', async () => {
    await expect(
      checkPasswordPolicy({
        path: '/sign-up/email',
        body: { email: 'a@b.com' },
      })
    ).resolves.toBeUndefined();
  });

  it('throws when password violates policy on guarded path', async () => {
    await expect(
      checkPasswordPolicy({
        path: '/sign-up/email',
        body: { email: 'user@example.com', password: 'short' },
      })
    ).rejects.toThrow();
  });

  it('passes when password meets policy', async () => {
    await expect(
      checkPasswordPolicy({
        path: '/sign-up/email',
        body: { email: 'user@example.com', password: 'MyStr0ng!PassTest' },
      })
    ).resolves.toBeUndefined();
  });
});
