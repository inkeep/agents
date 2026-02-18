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
    const events: string[] = [];

    vi.mocked(healthChecks.checkManageDb).mockImplementation(async () => {
      events.push('manageDb:start');
      await new Promise((resolve) => setTimeout(resolve, 10));
      events.push('manageDb:end');
      return true;
    });

    vi.mocked(healthChecks.checkRunDb).mockImplementation(async () => {
      events.push('runDb:start');
      await new Promise((resolve) => setTimeout(resolve, 10));
      events.push('runDb:end');
      return true;
    });

    await app.request('/ready');

    // If run in parallel, both checks start before either finishes.
    // Sequential execution would produce: start, end, start, end.
    const manageStart = events.indexOf('manageDb:start');
    const runStart = events.indexOf('runDb:start');
    const manageEnd = events.indexOf('manageDb:end');
    const runEnd = events.indexOf('runDb:end');

    expect(manageStart).toBeLessThan(manageEnd);
    expect(runStart).toBeLessThan(runEnd);
    // Both started before either finished — proves parallelism
    expect(manageStart).toBeLessThan(runEnd);
    expect(runStart).toBeLessThan(manageEnd);
  });
});
