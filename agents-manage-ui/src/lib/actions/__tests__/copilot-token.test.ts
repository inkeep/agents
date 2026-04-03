import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock next/headers
vi.mock('next/headers', () => ({
  cookies: vi.fn(),
}));

// Mock fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { getCopilotTokenAction } from '../copilot-token';

describe('getCopilotTokenAction', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  it('should return configuration_error when app ID is missing', async () => {
    process.env.PUBLIC_INKEEP_COPILOT_APP_ID = '';
    process.env.INKEEP_COPILOT_JWT_PRIVATE_KEY = 'key';
    process.env.INKEEP_COPILOT_JWT_KID = 'kid';

    const result = await getCopilotTokenAction();
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe('configuration_error');
    }
  });

  it('should return configuration_error when private key is missing', async () => {
    process.env.PUBLIC_INKEEP_COPILOT_APP_ID = 'app_copilot';
    process.env.INKEEP_COPILOT_JWT_PRIVATE_KEY = '';
    process.env.INKEEP_COPILOT_JWT_KID = 'kid';

    const result = await getCopilotTokenAction();
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe('configuration_error');
    }
  });

  it('should return configuration_error when kid is missing', async () => {
    process.env.PUBLIC_INKEEP_COPILOT_APP_ID = 'app_copilot';
    process.env.INKEEP_COPILOT_JWT_PRIVATE_KEY = 'key';
    process.env.INKEEP_COPILOT_JWT_KID = '';

    const result = await getCopilotTokenAction();
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe('configuration_error');
    }
  });

  it('should return auth_error when no cookies', async () => {
    process.env.PUBLIC_INKEEP_COPILOT_APP_ID = 'app_copilot';
    process.env.INKEEP_COPILOT_JWT_PRIVATE_KEY = 'key';
    process.env.INKEEP_COPILOT_JWT_KID = 'kid';

    const { cookies } = await import('next/headers');
    vi.mocked(cookies).mockResolvedValue({
      getAll: () => [],
    } as any);

    const result = await getCopilotTokenAction();
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe('auth_error');
      expect(result.error).toContain('No active session');
    }
  });

  it('should return auth_error when session is expired', async () => {
    process.env.PUBLIC_INKEEP_COPILOT_APP_ID = 'app_copilot';
    process.env.INKEEP_COPILOT_JWT_PRIVATE_KEY = 'key';
    process.env.INKEEP_COPILOT_JWT_KID = 'kid';

    const { cookies } = await import('next/headers');
    vi.mocked(cookies).mockResolvedValue({
      getAll: () => [{ name: 'session', value: 'expired' }],
    } as any);

    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
    });

    const result = await getCopilotTokenAction();
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe('auth_error');
      expect(result.error).toContain('Session expired');
    }
  });

  it('should return a signed JWT on success', async () => {
    const { generateKeyPairSync } = await import('node:crypto');
    const { privateKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' },
    });

    process.env.PUBLIC_INKEEP_COPILOT_APP_ID = 'app_copilot';
    process.env.INKEEP_COPILOT_JWT_PRIVATE_KEY = Buffer.from(privateKey).toString('base64');
    process.env.INKEEP_COPILOT_JWT_KID = 'pg-test123';

    const { cookies } = await import('next/headers');
    vi.mocked(cookies).mockResolvedValue({
      getAll: () => [{ name: 'session', value: 'valid-token' }],
    } as any);

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ user: { id: 'user-123' } }),
    });

    const result = await getCopilotTokenAction();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.appId).toBe('app_copilot');
      expect(result.data.apiKey).toBeTruthy();
      expect(result.data.expiresAt).toBeTruthy();
      expect(result.data.cookieHeader).toBe('session=valid-token');

      // Verify JWT structure
      const parts = result.data.apiKey.split('.');
      expect(parts).toHaveLength(3);

      const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
      expect(header.alg).toBe('RS256');
      expect(header.kid).toBe('pg-test123');

      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
      expect(payload.sub).toBe('user-123');
      expect(payload.iat).toBeDefined();
      expect(payload.exp).toBeDefined();
      expect(payload.exp - payload.iat).toBe(3600);
    }
  });
});
