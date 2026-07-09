import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAgentsHono: vi.fn(() => ({ fetch: vi.fn() })),
  createAuth: vi.fn(() => ({ type: 'auth' })),
  createDefaultCredentialStores: vi.fn(() => [{ id: 'store' }]),
  CredentialStoreRegistry: vi.fn(function CredentialStoreRegistry(
    this: { stores: unknown },
    stores: unknown
  ) {
    this.stores = stores;
  }),
  scheduleEnsurePlaygroundAppConfig: vi.fn(),
}));

vi.mock('@inkeep/agents-core', () => ({
  CredentialStoreRegistry: mocks.CredentialStoreRegistry,
  createDefaultCredentialStores: mocks.createDefaultCredentialStores,
}));

vi.mock('@inkeep/agents-core/auth', () => ({
  createAuth: mocks.createAuth,
}));

vi.mock('../createApp', () => ({
  createAgentsHono: mocks.createAgentsHono,
}));

vi.mock('../data/db/manageDbPool', () => ({
  default: {},
}));

vi.mock('../data/db/runDbClient', () => ({
  default: {},
}));

vi.mock('../env', () => ({
  env: {
    BETTER_AUTH_SECRET: 'test-secret',
    INKEEP_AGENTS_API_URL: 'http://localhost:3002',
  },
}));

vi.mock('../startup/playground-app', () => ({
  scheduleEnsurePlaygroundAppConfig: mocks.scheduleEnsurePlaygroundAppConfig,
}));

describe('createAgentsApp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('schedules playground app configuration for factory-created apps', async () => {
    const { createAgentsApp } = await import('../factory');

    createAgentsApp();

    expect(mocks.scheduleEnsurePlaygroundAppConfig).toHaveBeenCalledTimes(1);
    expect(mocks.createAgentsHono).toHaveBeenCalledTimes(1);
  });
});
