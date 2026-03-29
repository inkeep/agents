import { Hono } from 'hono';
import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('../../../env', () => ({
  env: {
    SLACK_MCP_API_KEY: 'test-slack-api-key',
  },
}));

describe('slack mcp auth middleware', () => {
  let slackMcpAuth: typeof import('../../../slack/mcp/auth').slackMcpAuth;

  beforeAll(async () => {
    ({ slackMcpAuth } = await import('../../../slack/mcp/auth'));
  });

  const validHeaders = {
    'x-inkeep-tool-id': 'tool-123',
    'x-inkeep-tenant-id': 'tenant-123',
    'x-inkeep-project-id': 'project-123',
    Authorization: 'Bearer test-slack-api-key',
  };

  function createTestApp() {
    const app = new Hono<{ Variables: { toolId: string; tenantId: string; projectId: string } }>();
    app.use('/', slackMcpAuth());
    app.post('/', (c) =>
      c.json({
        toolId: c.get('toolId'),
        tenantId: c.get('tenantId'),
        projectId: c.get('projectId'),
      })
    );
    return app;
  }

  it('returns 401 when x-inkeep-tool-id header is missing', async () => {
    const app = createTestApp();
    const res = await app.request('/', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer test-slack-api-key',
      },
    });
    expect(res.status).toBe(401);
  });

  it('returns 401 when x-inkeep-tenant-id header is missing', async () => {
    const app = createTestApp();
    const res = await app.request('/', {
      method: 'POST',
      headers: {
        'x-inkeep-tool-id': 'tool-123',
        Authorization: 'Bearer test-slack-api-key',
      },
    });
    expect(res.status).toBe(401);
  });

  it('returns 401 when x-inkeep-project-id header is missing', async () => {
    const app = createTestApp();
    const res = await app.request('/', {
      method: 'POST',
      headers: {
        'x-inkeep-tool-id': 'tool-123',
        'x-inkeep-tenant-id': 'tenant-123',
        Authorization: 'Bearer test-slack-api-key',
      },
    });
    expect(res.status).toBe(401);
  });

  it('returns 401 when Authorization header is missing', async () => {
    const app = createTestApp();
    const res = await app.request('/', {
      method: 'POST',
      headers: {
        'x-inkeep-tool-id': 'tool-123',
        'x-inkeep-tenant-id': 'tenant-123',
        'x-inkeep-project-id': 'project-123',
      },
    });
    expect(res.status).toBe(401);
  });

  it('returns 401 when API key is invalid', async () => {
    const app = createTestApp();
    const res = await app.request('/', {
      method: 'POST',
      headers: {
        ...validHeaders,
        Authorization: 'Bearer wrong-key',
      },
    });
    expect(res.status).toBe(401);
  });

  it('returns 401 when Authorization format is invalid', async () => {
    const app = createTestApp();
    const res = await app.request('/', {
      method: 'POST',
      headers: {
        ...validHeaders,
        Authorization: 'Basic test-slack-api-key',
      },
    });
    expect(res.status).toBe(401);
  });

  it('passes through with valid credentials and sets context variables', async () => {
    const app = createTestApp();
    const res = await app.request('/', {
      method: 'POST',
      headers: validHeaders,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.toolId).toBe('tool-123');
    expect(body.tenantId).toBe('tenant-123');
    expect(body.projectId).toBe('project-123');
  });
});
