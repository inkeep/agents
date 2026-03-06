import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('deployment-env', () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.VERCEL_ENV;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.VERCEL_ENV;
  });

  it('falls back to localhost API URL in development when INKEEP_AGENTS_API_URL is unset', async () => {
    vi.doMock('../../env', () => ({
      env: {
        NODE_ENV: 'development',
        ENVIRONMENT: 'development',
        INKEEP_AGENTS_API_URL: undefined,
        INKEEP_AGENTS_MANAGE_UI_URL: undefined,
      },
    }));

    const { requireAgentsApiUrl } = await import('../../utils/deployment-env');
    expect(requireAgentsApiUrl()).toBe('http://localhost:3002');
  });

  it('throws when API URL resolves to localhost in strict deployment mode', async () => {
    process.env.VERCEL_ENV = 'preview';
    vi.doMock('../../env', () => ({
      env: {
        NODE_ENV: 'development',
        ENVIRONMENT: 'development',
        INKEEP_AGENTS_API_URL: 'http://localhost:3002',
        INKEEP_AGENTS_MANAGE_UI_URL: 'https://pr-123-ui.preview.inkeep.com',
      },
    }));

    const { requireAgentsApiUrl } = await import('../../utils/deployment-env');
    expect(() => requireAgentsApiUrl()).toThrow(
      'INKEEP_AGENTS_API_URL resolves to localhost in preview/production'
    );
  });

  it('throws when manage UI URL is missing in strict deployment mode', async () => {
    process.env.VERCEL_ENV = 'production';
    vi.doMock('../../env', () => ({
      env: {
        NODE_ENV: 'production',
        ENVIRONMENT: 'production',
        INKEEP_AGENTS_API_URL: 'https://agents-api.inkeep.com',
        INKEEP_AGENTS_MANAGE_UI_URL: undefined,
      },
    }));

    const { resolveManageUiUrl } = await import('../../utils/deployment-env');
    expect(() => resolveManageUiUrl()).toThrow(
      'INKEEP_AGENTS_MANAGE_UI_URL is required in preview/production'
    );
  });

  it('falls back to localhost manage UI URL in development when unset', async () => {
    vi.doMock('../../env', () => ({
      env: {
        NODE_ENV: 'development',
        ENVIRONMENT: 'development',
        INKEEP_AGENTS_API_URL: 'http://localhost:3002',
        INKEEP_AGENTS_MANAGE_UI_URL: undefined,
      },
    }));

    const { resolveManageUiUrl } = await import('../../utils/deployment-env');
    expect(resolveManageUiUrl()).toBe('http://localhost:3000');
  });
});
