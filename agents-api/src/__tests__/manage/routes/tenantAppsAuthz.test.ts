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
    // The main scoped listing is short-circuited; only the unscoped
    // tenantHasAnyApps probe runs (one call, with `limit: 1`).
    expect(listAppsPaginatedMock).toHaveBeenCalledTimes(1);
    expect(listAppsPaginatedMock).toHaveBeenCalledWith({
      scopes: { tenantId: 'tenant-1' },
      pagination: { page: 1, limit: 1 },
      type: undefined,
    });

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

describe('GET /manage/tenants/:tenantId/apps — role and tenantHasAnyApps response fields', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listAppsPaginatedMock.mockResolvedValue(emptyPage);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns role and tenantHasAnyApps=true when a member with no project access is in a tenant with apps elsewhere', async () => {
    listUsableProjectIdsMock.mockResolvedValue([]);
    // The handler's early-return path runs the unscoped tenantHasAnyApps probe.
    listAppsPaginatedMock.mockResolvedValueOnce({
      data: [{ id: 'app-elsewhere' }],
      pagination: { page: 1, limit: 1, total: 1, pages: 1 },
    });

    const app = buildHarness({ userId: 'user-no-projects', tenantRole: 'member' });
    const res = await app.request('/manage/tenants/tenant-1/apps?type=support_copilot');

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([]);
    expect(body.role).toBe('member');
    expect(body.tenantHasAnyApps).toBe(true);
    // Only the unscoped probe runs — main listing is short-circuited.
    expect(listAppsPaginatedMock).toHaveBeenCalledTimes(1);
    expect(listAppsPaginatedMock).toHaveBeenCalledWith({
      scopes: { tenantId: 'tenant-1' },
      pagination: { page: 1, limit: 1 },
      type: 'support_copilot',
    });
  });

  it('returns tenantHasAnyApps=false when a member with no project access is in a tenant with zero apps', async () => {
    listUsableProjectIdsMock.mockResolvedValue([]);
    listAppsPaginatedMock.mockResolvedValueOnce(emptyPage);

    const app = buildHarness({ userId: 'user-no-projects', tenantRole: 'member' });
    const res = await app.request('/manage/tenants/tenant-1/apps');

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([]);
    expect(body.role).toBe('member');
    expect(body.tenantHasAnyApps).toBe(false);
  });

  it('fires a second unscoped query when a member has projects but the scoped result is empty', async () => {
    listUsableProjectIdsMock.mockResolvedValue(['proj-a']);
    // First call (scoped to user's projects) returns empty.
    listAppsPaginatedMock.mockResolvedValueOnce(emptyPage);
    // Second call (unscoped tenant probe) finds apps elsewhere.
    listAppsPaginatedMock.mockResolvedValueOnce({
      data: [{ id: 'app-elsewhere' }],
      pagination: { page: 1, limit: 1, total: 1, pages: 1 },
    });

    const app = buildHarness({ userId: 'user-non-admin', tenantRole: 'member' });
    const res = await app.request('/manage/tenants/tenant-1/apps');

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([]);
    expect(body.role).toBe('member');
    expect(body.tenantHasAnyApps).toBe(true);
    expect(listAppsPaginatedMock).toHaveBeenCalledTimes(2);
    expect(listAppsPaginatedMock).toHaveBeenNthCalledWith(1, {
      scopes: { tenantId: 'tenant-1', projectIds: ['proj-a'] },
      pagination: { page: 1, limit: 10 },
      type: undefined,
    });
    expect(listAppsPaginatedMock).toHaveBeenNthCalledWith(2, {
      scopes: { tenantId: 'tenant-1' },
      pagination: { page: 1, limit: 1 },
      type: undefined,
    });
  });

  it('skips the second query and returns tenantHasAnyApps=true when the scoped result is non-empty', async () => {
    listUsableProjectIdsMock.mockResolvedValue(['proj-a']);
    listAppsPaginatedMock.mockResolvedValueOnce({
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
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.role).toBe('member');
    expect(body.tenantHasAnyApps).toBe(true);
    // No second probe — non-empty result is authoritative.
    expect(listAppsPaginatedMock).toHaveBeenCalledTimes(1);
  });

  it('returns role=admin and tenantHasAnyApps=false without a second query when an admin sees an empty list', async () => {
    listAppsPaginatedMock.mockResolvedValue(emptyPage);

    const app = buildHarness({ userId: 'user-admin', tenantRole: 'admin' });
    const res = await app.request('/manage/tenants/tenant-1/apps');

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([]);
    expect(body.role).toBe('admin');
    // Admins see the whole tenant, so empty is authoritative — no extra DB hit.
    expect(body.tenantHasAnyApps).toBe(false);
    expect(listAppsPaginatedMock).toHaveBeenCalledTimes(1);
  });

  it('returns role=owner and tenantHasAnyApps=true for an owner with apps', async () => {
    listAppsPaginatedMock.mockResolvedValueOnce({
      data: [{ id: 'app-a' }],
      pagination: { page: 1, limit: 10, total: 1, pages: 1 },
    });

    const app = buildHarness({ userId: 'user-owner', tenantRole: 'owner' });
    const res = await app.request('/manage/tenants/tenant-1/apps');

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.role).toBe('owner');
    expect(body.tenantHasAnyApps).toBe(true);
    expect(listAppsPaginatedMock).toHaveBeenCalledTimes(1);
  });
});
