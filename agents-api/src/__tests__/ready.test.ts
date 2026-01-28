import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAgentsHono } from '../createApp';
import * as healthChecks from '../utils/healthChecks';

vi.mock('../utils/healthChecks', () => ({
  checkManageDb: vi.fn(),
  checkRunDb: vi.fn(),
}));

describe('GET /ready', () => {
  let app: ReturnType<typeof createAgentsHono>;

  beforeEach(() => {
    app = createAgentsHono({
      serverConfig: { port: 3002, serverOptions: {} },
      credentialStores: { getAll: () => [], get: () => null } as any,
      auth: null,
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('returns HTTP 200 with status ok when all database checks pass', async () => {
    vi.mocked(healthChecks.checkManageDb).mockResolvedValue(true);
    vi.mocked(healthChecks.checkRunDb).mockResolvedValue(true);

    const res = await app.request('/ready');

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');

    const body = await res.json();
    expect(body).toEqual({
      status: 'ok',
      manageDb: true,
      runDb: true,
    });
  });

  it('returns HTTP 503 with problem details when manage database check fails', async () => {
    vi.mocked(healthChecks.checkManageDb).mockResolvedValue(false);
    vi.mocked(healthChecks.checkRunDb).mockResolvedValue(true);

    const res = await app.request('/ready');

    expect(res.status).toBe(503);
    expect(res.headers.get('content-type')).toContain('application/problem+json');

    const body = await res.json();
    expect(body).toEqual({
      type: 'https://httpstatuses.com/503',
      title: 'Service Unavailable',
      status: 503,
      detail: 'Health checks failed: manage database',
      checks: {
        manageDb: false,
        runDb: true,
      },
    });
  });

  it('returns HTTP 503 with problem details when run database check fails', async () => {
    vi.mocked(healthChecks.checkManageDb).mockResolvedValue(true);
    vi.mocked(healthChecks.checkRunDb).mockResolvedValue(false);

    const res = await app.request('/ready');

    expect(res.status).toBe(503);
    expect(res.headers.get('content-type')).toContain('application/problem+json');

    const body = await res.json();
    expect(body).toEqual({
      type: 'https://httpstatuses.com/503',
      title: 'Service Unavailable',
      status: 503,
      detail: 'Health checks failed: run database',
      checks: {
        manageDb: true,
        runDb: false,
      },
    });
  });

  it('returns HTTP 503 with problem details when both database checks fail', async () => {
    vi.mocked(healthChecks.checkManageDb).mockResolvedValue(false);
    vi.mocked(healthChecks.checkRunDb).mockResolvedValue(false);

    const res = await app.request('/ready');

    expect(res.status).toBe(503);
    expect(res.headers.get('content-type')).toContain('application/problem+json');

    const body = await res.json();
    expect(body).toEqual({
      type: 'https://httpstatuses.com/503',
      title: 'Service Unavailable',
      status: 503,
      detail: 'Health checks failed: manage database, run database',
      checks: {
        manageDb: false,
        runDb: false,
      },
    });
  });

  it('runs database checks in parallel', async () => {
    let manageDbStartTime = 0;
    let runDbStartTime = 0;

    vi.mocked(healthChecks.checkManageDb).mockImplementation(async () => {
      manageDbStartTime = performance.now();
      await new Promise((resolve) => setTimeout(resolve, 10));
      return true;
    });

    vi.mocked(healthChecks.checkRunDb).mockImplementation(async () => {
      runDbStartTime = performance.now();
      await new Promise((resolve) => setTimeout(resolve, 10));
      return true;
    });

    const startTime = performance.now();
    await app.request('/ready');
    const elapsed = performance.now() - startTime;

    // If run in parallel, both checks should start nearly simultaneously
    // and total time should be ~10ms, not ~20ms
    expect(Math.abs(manageDbStartTime - runDbStartTime)).toBeLessThan(5);
    expect(elapsed).toBeLessThan(50); // Allow some overhead but not 2x sequential time
  });
});
