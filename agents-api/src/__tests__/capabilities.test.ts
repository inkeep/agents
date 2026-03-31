import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createAgentsHono } from '../createApp';

describe('GET /capabilities', () => {
  const originalGatewayKey = process.env.AI_GATEWAY_API_KEY;

  beforeEach(() => {
    delete process.env.AI_GATEWAY_API_KEY;
  });

  afterEach(() => {
    if (originalGatewayKey !== undefined) {
      process.env.AI_GATEWAY_API_KEY = originalGatewayKey;
    } else {
      delete process.env.AI_GATEWAY_API_KEY;
    }
  });

  it('returns sandbox.configured=false and gateway features disabled when no config', async () => {
    const app = createAgentsHono({
      serverConfig: { port: 3002, serverOptions: {} },
      credentialStores: { getAll: () => [], get: () => null } as any,
      auth: null as any,
    });

    const res = await app.request('/manage/capabilities');
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      sandbox: { configured: false },
      modelFallback: { enabled: false },
      costTracking: { enabled: false },
    });
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
      modelFallback: { enabled: false },
      costTracking: { enabled: false },
    });
  });

  it('returns modelFallback and costTracking enabled when AI_GATEWAY_API_KEY is set', async () => {
    process.env.AI_GATEWAY_API_KEY = 'test-gateway-key';

    const app = createAgentsHono({
      serverConfig: { port: 3002, serverOptions: {} },
      credentialStores: { getAll: () => [], get: () => null } as any,
      auth: null as any,
    });

    const res = await app.request('/manage/capabilities');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.modelFallback).toEqual({ enabled: true });
    expect(body.costTracking).toEqual({ enabled: true });
  });
});
