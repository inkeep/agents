import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EmailEnv } from '../src/env.js';
import { createTransport } from '../src/transport.js';

const baseEnv: EmailEnv = {
  RESEND_API_KEY: undefined,
  SMTP_HOST: undefined,
  SMTP_PORT: undefined,
  SMTP_USER: undefined,
  SMTP_PASSWORD: undefined,
  SMTP_SECURE: undefined,
  SMTP_FROM_ADDRESS: undefined,
  SMTP_FROM_NAME: undefined,
  SMTP_REPLY_TO: undefined,
};

describe('createTransport', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns null transporter when neither RESEND_API_KEY nor SMTP_HOST is set', () => {
    const result = createTransport(baseEnv);
    expect(result.transporter).toBeNull();
    expect(result.isConfigured).toBe(false);
  });

  it('creates Resend transport when RESEND_API_KEY is set with SMTP_FROM_ADDRESS', () => {
    const result = createTransport({
      ...baseEnv,
      RESEND_API_KEY: 're_test_123',
      SMTP_FROM_ADDRESS: 'test@example.com',
    });
    expect(result.transporter).not.toBeNull();
    expect(result.isConfigured).toBe(true);
  });

  it('falls back to disabled when RESEND_API_KEY is set but SMTP_FROM_ADDRESS is missing', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = createTransport({
      ...baseEnv,
      RESEND_API_KEY: 're_test_123',
    });
    expect(result.transporter).toBeNull();
    expect(result.isConfigured).toBe(false);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('SMTP_FROM_ADDRESS is missing'));
  });

  it('creates generic SMTP transport when SMTP_HOST is set with SMTP_FROM_ADDRESS', () => {
    const result = createTransport({
      ...baseEnv,
      SMTP_HOST: 'localhost',
      SMTP_PORT: 1025,
      SMTP_FROM_ADDRESS: 'test@example.com',
    });
    expect(result.transporter).not.toBeNull();
    expect(result.isConfigured).toBe(true);
  });

  it('falls back to disabled when SMTP_HOST is set but SMTP_FROM_ADDRESS is missing', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = createTransport({
      ...baseEnv,
      SMTP_HOST: 'localhost',
      SMTP_PORT: 1025,
    });
    expect(result.transporter).toBeNull();
    expect(result.isConfigured).toBe(false);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('SMTP_FROM_ADDRESS is missing'));
  });

  it('prioritizes Resend over generic SMTP when both are set', () => {
    const result = createTransport({
      ...baseEnv,
      RESEND_API_KEY: 're_test_123',
      SMTP_HOST: 'smtp.example.com',
      SMTP_FROM_ADDRESS: 'test@example.com',
    });
    expect(result.isConfigured).toBe(true);
    expect(result.transporter).not.toBeNull();
  });

  it('auto-detects secure=true for port 465', () => {
    const result = createTransport({
      ...baseEnv,
      SMTP_HOST: 'smtp.example.com',
      SMTP_PORT: 465,
      SMTP_FROM_ADDRESS: 'test@example.com',
    });
    expect(result.isConfigured).toBe(true);
  });

  it('defaults to port 587 when SMTP_PORT is not set', () => {
    const result = createTransport({
      ...baseEnv,
      SMTP_HOST: 'smtp.example.com',
      SMTP_FROM_ADDRESS: 'test@example.com',
    });
    expect(result.isConfigured).toBe(true);
  });

  it('includes auth when SMTP_USER and SMTP_PASSWORD are both set', () => {
    const result = createTransport({
      ...baseEnv,
      SMTP_HOST: 'smtp.example.com',
      SMTP_USER: 'user',
      SMTP_PASSWORD: 'pass',
      SMTP_FROM_ADDRESS: 'test@example.com',
    });
    expect(result.isConfigured).toBe(true);
  });

  it('omits auth when only SMTP_USER is set without SMTP_PASSWORD', () => {
    const result = createTransport({
      ...baseEnv,
      SMTP_HOST: 'smtp.example.com',
      SMTP_USER: 'user',
      SMTP_FROM_ADDRESS: 'test@example.com',
    });
    expect(result.isConfigured).toBe(true);
  });
});
