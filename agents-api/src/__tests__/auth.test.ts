import type { UserAuthConfig } from '@inkeep/agents-core/auth';
import { describe, expect, it, vi } from 'vitest';
import { createAgentsApp } from '../index';

vi.mock('../../env', () => ({
  env: {
    INKEEP_AGENTS_API_URL: 'http://localhost:3002',
    BETTER_AUTH_URL: 'http://localhost:3002',
    BETTER_AUTH_SECRET: 'test-secret',
  },
}));

vi.mock('../../data/db/manageDbClient', () => ({
  default: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('../../initialization', () => ({
  initializeDefaultUser: vi.fn(),
}));

describe('Auth Integration', () => {
  it('should create management app with auth enabled by default', () => {
    const app = createAgentsApp();
    expect(app).toBeDefined();
  });

  it('should create management app with custom auth config', () => {
    const customAuthConfig: UserAuthConfig = {
      ssoProviders: [],
    };

    const app = createAgentsApp({ auth: customAuthConfig });
    expect(app).toBeDefined();
  });

  it('should handle auth disabled mode', () => {
    vi.resetModules();
    vi.doMock('../../env', () => ({
      env: {
        INKEEP_AGENTS_API_URL: 'http://localhost:3002',
      },
    }));

    const app = createAgentsApp();
    expect(app).toBeDefined();
  });

  it('should export createAuth0Provider helper', async () => {
    const { createAuth0Provider } = await import('../index');
    expect(createAuth0Provider).toBeDefined();
    expect(typeof createAuth0Provider).toBe('function');
  });

  it('should export createOIDCProvider helper', async () => {
    const { createOIDCProvider } = await import('../index');
    expect(createOIDCProvider).toBeDefined();
    expect(typeof createOIDCProvider).toBe('function');
  });
});
