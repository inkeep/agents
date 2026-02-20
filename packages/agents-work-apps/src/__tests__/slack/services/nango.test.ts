import { beforeEach, describe, expect, it, vi } from 'vitest';

const NangoMock = vi.fn().mockImplementation(() => ({
  listConnections: vi.fn(),
  getConnection: vi.fn(),
}));

vi.mock('@nangohq/node', () => ({
  Nango: NangoMock,
}));

vi.mock('../../../env', () => ({
  env: {
    NANGO_SLACK_SECRET_KEY: 'test-secret-key',
    NANGO_SECRET_KEY: undefined,
    NANGO_SERVER_URL: 'https://nango.test',
    NANGO_SLACK_INTEGRATION_ID: 'slack-agent',
    ENVIRONMENT: 'test',
  },
}));

vi.mock('../../../db/runDbClient', () => ({
  default: {},
}));

vi.mock('../../../logger', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('@inkeep/agents-core', () => ({
  findWorkAppSlackWorkspaceBySlackTeamId: vi.fn(),
}));

describe('getSlackNango singleton', () => {
  beforeEach(() => {
    vi.resetModules();
    NangoMock.mockClear();
  });

  it('should return the same instance on repeated calls', async () => {
    const { getSlackNango } = await import('../../../slack/services/nango');

    const instance1 = getSlackNango();
    const instance2 = getSlackNango();

    expect(instance1).toBe(instance2);
    expect(NangoMock).toHaveBeenCalledTimes(1);
  });
});
