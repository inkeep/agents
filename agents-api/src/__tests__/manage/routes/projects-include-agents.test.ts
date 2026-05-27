import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { listAgentsAcrossProjectMainBranchesMock, listAccessibleProjectIdsMock } = vi.hoisted(
  () => ({
    listAgentsAcrossProjectMainBranchesMock: vi.fn(),
    listAccessibleProjectIdsMock: vi.fn(),
  })
);

vi.mock('@inkeep/agents-core', async (importOriginal) => {
  const original = await importOriginal<typeof import('@inkeep/agents-core')>();
  return {
    ...original,
    listAgentsAcrossProjectMainBranches: listAgentsAcrossProjectMainBranchesMock,
    listAccessibleProjectIds: listAccessibleProjectIdsMock,
    listProjectsWithMetadataPaginated: () => () =>
      Promise.resolve({
        data: [
          {
            id: 'proj-1',
            tenantId: 'test-tenant',
            name: 'Project One',
            description: null,
            models: null,
            stopWhen: null,
            createdAt: '2026-01-01T00:00:00Z',
            configUpdatedAt: '2026-01-01T00:00:00Z',
          },
          {
            id: 'proj-2',
            tenantId: 'test-tenant',
            name: 'Project Two',
            description: null,
            models: null,
            stopWhen: null,
            createdAt: '2026-01-01T00:00:00Z',
            configUpdatedAt: '2026-01-01T00:00:00Z',
          },
        ],
        pagination: { page: 1, limit: 100, total: 2, pages: 1 },
      }),
  };
});

vi.mock('../../../data/db/manageDbClient.js', () => ({
  default: {},
}));

vi.mock('../../../data/db/runDbClient.js', () => ({
  default: { query: { projectMetadata: { findMany: vi.fn() } } },
}));

vi.mock('../../../middleware/projectAccess.js', () => ({
  requireProjectPermission: () => async (_c: unknown, next: () => Promise<void>) => next(),
}));

vi.mock('../../../middleware/requireEntitlement.js', () => ({
  requireEntitlement: () => async (_c: unknown, next: () => Promise<void>) => next(),
}));

vi.mock('../../../middleware/requirePermission.js', () => ({
  requirePermission: () => async (_c: unknown, next: () => Promise<void>) => next(),
}));

import { Hono } from 'hono';
import projectsRoutes from '../../../domains/manage/routes/projects';
import type { ManageAppVariables } from '../../../types/app';

function createTestApp() {
  const app = new Hono<{ Variables: ManageAppVariables }>();
  app.use('*', async (c, next) => {
    c.set('db', {} as ManageAppVariables['db']);
    c.set('tenantId', 'test-tenant');
    c.set('userId', 'user-1');
    c.set('tenantRole', 'owner');
    await next();
  });
  app.route('/:tenantId/projects', projectsRoutes);
  return app;
}

describe('GET /projects?include=agents', () => {
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createTestApp();
    listAccessibleProjectIdsMock.mockResolvedValue('all');
    listAgentsAcrossProjectMainBranchesMock.mockResolvedValue([
      { agentId: 'agent-1', agentName: 'Bot One', projectId: 'proj-1' },
      { agentId: 'agent-2', agentName: 'Bot Two', projectId: 'proj-1' },
      { agentId: 'agent-3', agentName: 'Bot Three', projectId: 'proj-2' },
    ]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should include agents array on each project when include=agents', async () => {
    const res = await app.request('/test-tenant/projects?include=agents');
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data).toHaveLength(2);

    const proj1 = body.data.find((p: any) => p.id === 'proj-1');
    expect(proj1.agents).toEqual([
      { agentId: 'agent-1', agentName: 'Bot One' },
      { agentId: 'agent-2', agentName: 'Bot Two' },
    ]);

    const proj2 = body.data.find((p: any) => p.id === 'proj-2');
    expect(proj2.agents).toEqual([{ agentId: 'agent-3', agentName: 'Bot Three' }]);
  });

  it('should not include agents when include param is omitted', async () => {
    const res = await app.request('/test-tenant/projects');
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data).toHaveLength(2);

    for (const project of body.data) {
      expect(project).not.toHaveProperty('agents');
    }

    expect(listAgentsAcrossProjectMainBranchesMock).not.toHaveBeenCalled();
  });

  it('should return empty agents array for projects with no agents', async () => {
    listAgentsAcrossProjectMainBranchesMock.mockResolvedValue([
      { agentId: 'agent-1', agentName: 'Bot One', projectId: 'proj-1' },
    ]);

    const res = await app.request('/test-tenant/projects?include=agents');
    expect(res.status).toBe(200);

    const body = await res.json();
    const proj2 = body.data.find((p: any) => p.id === 'proj-2');
    expect(proj2.agents).toEqual([]);
  });

  it('should reject invalid include values', async () => {
    const res = await app.request('/test-tenant/projects?include=invalid');
    expect(res.status).toBe(400);
  });
});
