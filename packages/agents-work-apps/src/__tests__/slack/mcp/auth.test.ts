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

  function createTestApp() {
    const app = new Hono<{ Variables: { toolId: string } }>();
    app.use('/', slackMcpAuth());
    app.post('/', (c) => c.json({ toolId: c.get('toolId') }));
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

  it('returns 401 when Authorization header is missing', async () => {
    const app = createTestApp();
    const res = await app.request('/', {
      method: 'POST',
      headers: {
        'x-inkeep-tool-id': 'tool-123',
      },
    });
    expect(res.status).toBe(401);
  });

  it('returns 401 when API key is invalid', async () => {
    const app = createTestApp();
    const res = await app.request('/', {
      method: 'POST',
      headers: {
        'x-inkeep-tool-id': 'tool-123',
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
        'x-inkeep-tool-id': 'tool-123',
        Authorization: 'Basic test-slack-api-key',
      },
    });
    expect(res.status).toBe(401);
  });

  it('passes through with valid credentials and sets toolId', async () => {
    const app = createTestApp();
    const res = await app.request('/', {
      method: 'POST',
      headers: {
        'x-inkeep-tool-id': 'tool-123',
        Authorization: 'Bearer test-slack-api-key',
      },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.toolId).toBe('tool-123');
  });
});
