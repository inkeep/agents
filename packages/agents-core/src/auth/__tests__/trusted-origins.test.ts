import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { testRunDbClient } from '../../__tests__/setup';
import { querySsoProviderIssuers } from '../../data-access/runtime/auth';
import type { Env } from '../../env';
import { getTrustedOrigins } from '../auth-config-utils';

const authenticationEnvironment = vi.hoisted<
  Pick<
    Env,
    'ENVIRONMENT' | 'INKEEP_AGENTS_MANAGE_UI_URL' | 'INKEEP_AGENTS_API_URL' | 'TRUSTED_ORIGIN'
  >
>(() => ({
  ENVIRONMENT: 'production',
  INKEEP_AGENTS_MANAGE_UI_URL: 'https://manage.example.com',
  INKEEP_AGENTS_API_URL: 'https://api.example.com',
  TRUSTED_ORIGIN: 'https://preview.example.com',
}));

vi.mock('../../env', () => ({ env: authenticationEnvironment }));

describe('getTrustedOrigins', () => {
  beforeEach(async () => {
    authenticationEnvironment.ENVIRONMENT = 'production';
    authenticationEnvironment.INKEEP_AGENTS_MANAGE_UI_URL = 'https://manage.example.com';
    authenticationEnvironment.INKEEP_AGENTS_API_URL = 'https://api.example.com';
    authenticationEnvironment.TRUSTED_ORIGIN = 'https://preview.example.com';
    vi.stubEnv('NODE_ENV', 'production');

    expect(await querySsoProviderIssuers(testRunDbClient)()).toEqual([]);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('does not include built-in localhost origins in production', async () => {
    const origins = await getTrustedOrigins(testRunDbClient, undefined);

    expect(origins).toEqual(
      expect.arrayContaining([
        'https://manage.example.com',
        'https://api.example.com',
        'https://preview.example.com',
      ])
    );
    expect(origins).not.toContain('http://localhost:3000');
    expect(origins).not.toContain('http://localhost:3002');
  });

  it('includes built-in localhost origins in explicit development mode', async () => {
    authenticationEnvironment.ENVIRONMENT = 'development';

    const origins = await getTrustedOrigins(testRunDbClient, undefined);

    expect(origins).toEqual(
      expect.arrayContaining([
        'http://localhost:3000',
        'http://localhost:3002',
        'https://manage.example.com',
        'https://api.example.com',
        'https://preview.example.com',
      ])
    );
  });

  it.each([
    'production',
    'pentest',
    'test',
    undefined,
  ] as const)('does not enable built-in localhost origins for ENVIRONMENT %s through NODE_ENV', async (environment) => {
    authenticationEnvironment.ENVIRONMENT = environment;
    vi.stubEnv('NODE_ENV', 'development');

    const origins = await getTrustedOrigins(testRunDbClient, undefined);

    expect(origins).toEqual(
      expect.arrayContaining([
        'https://manage.example.com',
        'https://api.example.com',
        'https://preview.example.com',
      ])
    );
    expect(origins).not.toContain('http://localhost:3000');
    expect(origins).not.toContain('http://localhost:3002');
  });

  it('preserves an explicitly configured localhost origin outside development', async () => {
    authenticationEnvironment.INKEEP_AGENTS_MANAGE_UI_URL = 'http://localhost:3000';

    const origins = await getTrustedOrigins(testRunDbClient, undefined);

    expect(origins).toEqual(
      expect.arrayContaining([
        'http://localhost:3000',
        'https://api.example.com',
        'https://preview.example.com',
      ])
    );
    expect(origins).not.toContain('http://localhost:3002');
  });
});
