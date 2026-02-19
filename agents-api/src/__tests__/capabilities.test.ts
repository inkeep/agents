import { describe, expect, it } from 'vitest';
import { createAgentsHono } from '../createApp';

describe('GET /capabilities', () => {
  it('returns sandbox.configured=false when sandboxConfig is not provided', async () => {
    const app = createAgentsHono({
      serverConfig: { port: 3002, serverOptions: {} },
      credentialStores: { getAll: () => [], get: () => null } as any,
      auth: null as any,
    });

    const res = await app.request('/manage/capabilities');
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ sandbox: { configured: false } });
  });

  it('returns sandbox details when sandboxConfig is provided', async () => {
    const app = createAgentsHono({
      serverConfig: { port: 3002, serverOptions: {} },
      credentialStores: { getAll: () => [], get: () => null } as any,
      auth: null as any,
      sandboxConfig: { provider: 'native', runtime: 'node22', timeout: 123, vcpus: 2 },
    });

    const res = await app.request('/manage/capabilities');
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      sandbox: { configured: true, provider: 'native', runtime: 'node22' },
    });
  });
});
