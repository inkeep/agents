import { OpenAPIHono } from '@hono/zod-openapi';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { listUsableProjectIdsMock, listAppsPaginatedMock } = vi.hoisted(() => ({
  listUsableProjectIdsMock: vi.fn(),
  listAppsPaginatedMock: vi.fn(),
}));

vi.mock('@inkeep/agents-core', async (importOriginal) => {
  const original = await importOriginal<typeof import('@inkeep/agents-core')>();
  return {
    ...original,
    listUsableProjectIds: listUsableProjectIdsMock,
    listAppsPaginated: () => listAppsPaginatedMock,
  };
});

vi.mock('../../../data/db/runDbClient', () => ({
  default: {},
}));

import tenantAppsRoutes from '../../../domains/manage/routes/tenantApps';

type ContextOverrides = {
  userId?: string;
  tenantRole?: 'owner' | 'admin' | 'member' | undefined;
};

const buildHarness = ({ userId = 'user-non-admin', tenantRole = 'member' }: ContextOverrides) => {
  const harness = new OpenAPIHono();
  harness.use('*', async (c, next) => {
    if (userId !== undefined) c.set('userId' as never, userId as never);
    if (tenantRole !== undefined) c.set('tenantRole' as never, tenantRole as never);
    await next();
  });
  harness.route('/manage/tenants/:tenantId/apps', tenantAppsRoutes);
  return harness;
};

const emptyPage = {
  data: [],
  pagination: { page: 1, limit: 10, total: 0, pages: 0 },
};

describe('GET /manage/tenants/:tenantId/apps — project access filtering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listAppsPaginatedMock.mockResolvedValue(emptyPage);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('filters to projects the non-admin caller has use access on', async () => {
    listUsableProjectIdsMock.mockResolvedValue(['proj-a', 'proj-c']);
    listAppsPaginatedMock.mockResolvedValue({
      data: [
        {
          id: 'app-a',
          tenantId: 'tenant-1',
          projectId: 'proj-a',
          name: 'A',
          type: 'support_copilot',
          enabled: true,
          config: { type: 'support_copilot', supportCopilot: {} },
          defaultAgentId: null,
          defaultProjectId: 'proj-a',
          lastUsedAt: null,
          createdAt: '2025-01-01T00:00:00.000Z',
          updatedAt: '2025-01-01T00:00:00.000Z',
        },
      ],
      pagination: { page: 1, limit: 10, total: 1, pages: 1 },
    });

    const app = buildHarness({ userId: 'user-non-admin', tenantRole: 'member' });
    const res = await app.request('/manage/tenants/tenant-1/apps');

    expect(res.status).toBe(200);
    expect(listUsableProjectIdsMock).toHaveBeenCalledWith({
      userId: 'user-non-admin',
      tenantId: 'tenant-1',
    });
    expect(listAppsPaginatedMock).toHaveBeenCalledWith({
      scopes: { tenantId: 'tenant-1', projectIds: ['proj-a', 'proj-c'] },
      pagination: { page: 1, limit: 10 },
      type: undefined,
    });

    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe('app-a');
  });

  it('short-circuits to empty list when non-admin caller has no usable projects', async () => {
    listUsableProjectIdsMock.mockResolvedValue([]);

    const app = buildHarness({ userId: 'user-with-no-access', tenantRole: 'member' });
    const res = await app.request('/manage/tenants/tenant-1/apps');

    expect(res.status).toBe(200);
    expect(listAppsPaginatedMock).not.toHaveBeenCalled();

    const body = await res.json();
    expect(body.data).toEqual([]);
    expect(body.pagination.total).toBe(0);
  });

  it('skips SpiceDB lookup when caller is org owner', async () => {
    listAppsPaginatedMock.mockResolvedValue(emptyPage);

    const app = buildHarness({ userId: 'user-owner', tenantRole: 'owner' });
    const res = await app.request('/manage/tenants/tenant-1/apps');

    expect(res.status).toBe(200);
    expect(listUsableProjectIdsMock).not.toHaveBeenCalled();
    expect(listAppsPaginatedMock).toHaveBeenCalledWith({
      scopes: { tenantId: 'tenant-1' },
      pagination: { page: 1, limit: 10 },
      type: undefined,
    });
  });

  it('skips SpiceDB lookup when caller is org admin', async () => {
    listAppsPaginatedMock.mockResolvedValue(emptyPage);

    const app = buildHarness({ userId: 'user-admin', tenantRole: 'admin' });
    const res = await app.request('/manage/tenants/tenant-1/apps');

    expect(res.status).toBe(200);
    expect(listUsableProjectIdsMock).not.toHaveBeenCalled();
    expect(listAppsPaginatedMock).toHaveBeenCalledWith({
      scopes: { tenantId: 'tenant-1' },
      pagination: { page: 1, limit: 10 },
      type: undefined,
    });
  });

  it('forwards type filter alongside project filter', async () => {
    listUsableProjectIdsMock.mockResolvedValue(['proj-a']);

    const app = buildHarness({ userId: 'user-non-admin', tenantRole: 'member' });
    const res = await app.request('/manage/tenants/tenant-1/apps?type=support_copilot');

    expect(res.status).toBe(200);
    expect(listAppsPaginatedMock).toHaveBeenCalledWith({
      scopes: { tenantId: 'tenant-1', projectIds: ['proj-a'] },
      pagination: { page: 1, limit: 10 },
      type: 'support_copilot',
    });
  });
});
