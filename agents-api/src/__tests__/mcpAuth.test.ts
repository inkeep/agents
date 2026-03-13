import { signMcpAccessToken } from '@inkeep/agents-core';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { mcpAuth } from '../middleware/mcpAuth';

type TestVariables = { Variables: { tenantId: string; projectId: string } };

function createTestApp() {
  const app = new Hono<TestVariables>();
  app.use('/mcp', mcpAuth());
  app.all('/mcp', (c) => c.json({ tenantId: c.get('tenantId'), projectId: c.get('projectId') }));
  return app;
}

describe('mcpAuth', () => {
  const tenantId = 'tenant-abc';
  const projectId = 'project-xyz';

  it('should pass with valid JWT and matching headers', async () => {
    const token = await signMcpAccessToken({ tenantId, projectId });
    const res = await createTestApp().request('/mcp', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'x-inkeep-tenant-id': tenantId,
        'x-inkeep-project-id': projectId,
      },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tenantId).toBe(tenantId);
    expect(body.projectId).toBe(projectId);
  });

  it('should return 401 when Authorization header is missing', async () => {
    const res = await createTestApp().request('/mcp', {
      method: 'POST',
      headers: {
        'x-inkeep-tenant-id': tenantId,
        'x-inkeep-project-id': projectId,
      },
    });

    expect(res.status).toBe(401);
  });

  it('should return 401 when x-inkeep-tenant-id header is missing', async () => {
    const token = await signMcpAccessToken({ tenantId, projectId });
    const res = await createTestApp().request('/mcp', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'x-inkeep-project-id': projectId,
      },
    });

    expect(res.status).toBe(401);
  });

  it('should return 401 when x-inkeep-project-id header is missing', async () => {
    const token = await signMcpAccessToken({ tenantId, projectId });
    const res = await createTestApp().request('/mcp', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'x-inkeep-tenant-id': tenantId,
      },
    });

    expect(res.status).toBe(401);
  });

  it('should return 401 when JWT tenantId does not match header', async () => {
    const token = await signMcpAccessToken({ tenantId, projectId });
    const res = await createTestApp().request('/mcp', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'x-inkeep-tenant-id': 'different-tenant',
        'x-inkeep-project-id': projectId,
      },
    });

    expect(res.status).toBe(401);
  });

  it('should return 401 when JWT projectId does not match header', async () => {
    const token = await signMcpAccessToken({ tenantId, projectId });
    const res = await createTestApp().request('/mcp', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'x-inkeep-tenant-id': tenantId,
        'x-inkeep-project-id': 'different-project',
      },
    });

    expect(res.status).toBe(401);
  });

  it('should return 401 for an invalid JWT', async () => {
    const res = await createTestApp().request('/mcp', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer invalid.jwt.token',
        'x-inkeep-tenant-id': tenantId,
        'x-inkeep-project-id': projectId,
      },
    });

    expect(res.status).toBe(401);
  });
});
