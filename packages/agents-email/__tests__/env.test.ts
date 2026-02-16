import { describe, expect, it } from 'vitest';
import { parseEmailEnv } from '../src/env.js';

describe('parseEmailEnv', () => {
  it('parses empty env without errors', () => {
    const result = parseEmailEnv({});
    expect(result.RESEND_API_KEY).toBeUndefined();
    expect(result.SMTP_HOST).toBeUndefined();
    expect(result.SMTP_PORT).toBeUndefined();
    expect(result.SMTP_FROM_ADDRESS).toBeUndefined();
  });

  it('parses Resend config', () => {
    const result = parseEmailEnv({
      RESEND_API_KEY: 're_test_123',
      SMTP_FROM_ADDRESS: 'test@example.com',
      SMTP_FROM_NAME: 'Test',
    });
    expect(result.RESEND_API_KEY).toBe('re_test_123');
    expect(result.SMTP_FROM_ADDRESS).toBe('test@example.com');
    expect(result.SMTP_FROM_NAME).toBe('Test');
  });

  it('parses SMTP config with port coercion', () => {
    const result = parseEmailEnv({
      SMTP_HOST: 'localhost',
      SMTP_PORT: '1025',
      SMTP_FROM_ADDRESS: 'test@example.com',
    });
    expect(result.SMTP_HOST).toBe('localhost');
    expect(result.SMTP_PORT).toBe(1025);
  });

  it('parses SMTP_SECURE as boolean from string', () => {
    expect(parseEmailEnv({ SMTP_SECURE: 'true' }).SMTP_SECURE).toBe(true);
    expect(parseEmailEnv({ SMTP_SECURE: '1' }).SMTP_SECURE).toBe(true);
    expect(parseEmailEnv({ SMTP_SECURE: 'false' }).SMTP_SECURE).toBe(false);
    expect(parseEmailEnv({}).SMTP_SECURE).toBeUndefined();
  });

  it('parses reply-to address', () => {
    const result = parseEmailEnv({
      SMTP_REPLY_TO: 'support@inkeep.com',
    });
    expect(result.SMTP_REPLY_TO).toBe('support@inkeep.com');
  });
});
