import { describe, expect, it } from 'vitest';
import { createAgentsHono } from '../createApp';

describe('GET /health', () => {
  it('returns HTTP 204 (no content) for liveness check', async () => {
    const app = createAgentsHono({
      serverConfig: { port: 3002, serverOptions: {} },
      credentialStores: { getAll: () => [], get: () => null } as any,
      auth: null,
    });

    await app.request('/health');

    const startTime = performance.now();
    const res = await app.request('/health');
    const elapsed = performance.now() - startTime;

    expect(res.status).toBe(204);
    expect(await res.text()).toBe('');
    expect(elapsed).toBeLessThan(10);
  });
});
