import { describe, expect, it, vi } from 'vitest';

// Mock the MCP transport/server to avoid real MCP connections
vi.mock('@hono/mcp', () => ({
  StreamableHTTPTransport: vi.fn().mockImplementation(() => ({
    handleRequest: vi.fn().mockResolvedValue(new Response('ok', { status: 200 })),
  })),
}));

vi.mock('../dev-tools-mcp/server', () => ({
  createDevToolsServer: vi.fn().mockReturnValue({
    connect: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock('../dev-tools-search-mcp/server', () => ({
  createDevToolsSearchServer: vi.fn().mockReturnValue({
    connect: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock('../dev-tools-http-mcp/server', () => ({
  createDevToolsHttpServer: vi.fn().mockReturnValue({
    connect: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock('../dev-tools-media-mcp/server', () => ({
  createDevToolsMediaServer: vi.fn().mockReturnValue({
    connect: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock('../env.js', () => ({
  env: {
    EXA_API_KEY: 'test-exa-key',
    ENVIRONMENT: 'development',
  },
}));

import { signMcpAccessToken } from '@inkeep/agents-core';
import { Hono } from 'hono';
import { devToolsHttpMcpAuth } from '../dev-tools-http-mcp/auth';
import { devToolsMcpAuth } from '../dev-tools-mcp/auth';
import { devToolsMediaMcpAuth } from '../dev-tools-media-mcp/auth';
import { devToolsSearchMcpAuth } from '../dev-tools-search-mcp/auth';

type TestVariables = { Variables: { tenantId: string; projectId: string } };

function createTestApp(authMiddleware: ReturnType<typeof devToolsMcpAuth>) {
  const app = new Hono<TestVariables>();
  app.use('/mcp', authMiddleware);
  app.all('/mcp', (c) => c.json({ tenantId: c.get('tenantId'), projectId: c.get('projectId') }));
  return app;
}

describe('devToolsMcpAuth', () => {
  const tenantId = 'tenant-abc';
  const projectId = 'project-xyz';

  it('should pass with valid JWT and matching headers', async () => {
    const token = await signMcpAccessToken({ tenantId, projectId });
    const app = createTestApp(devToolsMcpAuth());

    const res = await app.request('/mcp', {
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
    const app = createTestApp(devToolsMcpAuth());

    const res = await app.request('/mcp', {
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
    const app = createTestApp(devToolsMcpAuth());

    const res = await app.request('/mcp', {
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
    const app = createTestApp(devToolsMcpAuth());

    const res = await app.request('/mcp', {
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
    const app = createTestApp(devToolsMcpAuth());

    const res = await app.request('/mcp', {
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
    const app = createTestApp(devToolsMcpAuth());

    const res = await app.request('/mcp', {
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
    const app = createTestApp(devToolsMcpAuth());

    const res = await app.request('/mcp', {
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

describe('devToolsSearchMcpAuth', () => {
  const tenantId = 'tenant-abc';
  const projectId = 'project-xyz';

  it('should pass with valid JWT and matching headers', async () => {
    const token = await signMcpAccessToken({ tenantId, projectId });
    const app = createTestApp(devToolsSearchMcpAuth());

    const res = await app.request('/mcp', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'x-inkeep-tenant-id': tenantId,
        'x-inkeep-project-id': projectId,
      },
    });

    expect(res.status).toBe(200);
  });

  it('should return 401 when Authorization header is missing', async () => {
    const app = createTestApp(devToolsSearchMcpAuth());

    const res = await app.request('/mcp', {
      method: 'POST',
      headers: {
        'x-inkeep-tenant-id': tenantId,
        'x-inkeep-project-id': projectId,
      },
    });

    expect(res.status).toBe(401);
  });
});

describe('devToolsHttpMcpAuth', () => {
  const tenantId = 'tenant-abc';
  const projectId = 'project-xyz';

  it('should pass with valid JWT and matching headers', async () => {
    const token = await signMcpAccessToken({ tenantId, projectId });
    const app = createTestApp(devToolsHttpMcpAuth());

    const res = await app.request('/mcp', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'x-inkeep-tenant-id': tenantId,
        'x-inkeep-project-id': projectId,
      },
    });

    expect(res.status).toBe(200);
  });

  it('should return 401 when Authorization header is missing', async () => {
    const app = createTestApp(devToolsHttpMcpAuth());

    const res = await app.request('/mcp', {
      method: 'POST',
      headers: {
        'x-inkeep-tenant-id': tenantId,
        'x-inkeep-project-id': projectId,
      },
    });

    expect(res.status).toBe(401);
  });

  it('should return 401 when JWT tenantId does not match header', async () => {
    const token = await signMcpAccessToken({ tenantId, projectId });
    const app = createTestApp(devToolsHttpMcpAuth());

    const res = await app.request('/mcp', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'x-inkeep-tenant-id': 'different-tenant',
        'x-inkeep-project-id': projectId,
      },
    });

    expect(res.status).toBe(401);
  });
});

describe('devToolsMediaMcpAuth', () => {
  const tenantId = 'tenant-abc';
  const projectId = 'project-xyz';

  it('should pass with valid JWT and matching headers', async () => {
    const token = await signMcpAccessToken({ tenantId, projectId });
    const app = createTestApp(devToolsMediaMcpAuth());

    const res = await app.request('/mcp', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'x-inkeep-tenant-id': tenantId,
        'x-inkeep-project-id': projectId,
      },
    });

    expect(res.status).toBe(200);
  });

  it('should return 401 when Authorization header is missing', async () => {
    const app = createTestApp(devToolsMediaMcpAuth());

    const res = await app.request('/mcp', {
      method: 'POST',
      headers: {
        'x-inkeep-tenant-id': tenantId,
        'x-inkeep-project-id': projectId,
      },
    });

    expect(res.status).toBe(401);
  });

  it('should return 401 when JWT projectId does not match header', async () => {
    const token = await signMcpAccessToken({ tenantId, projectId });
    const app = createTestApp(devToolsMediaMcpAuth());

    const res = await app.request('/mcp', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'x-inkeep-tenant-id': tenantId,
        'x-inkeep-project-id': 'different-project',
      },
    });

    expect(res.status).toBe(401);
  });
});
