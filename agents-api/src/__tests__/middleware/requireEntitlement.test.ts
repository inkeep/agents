import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';

const { mockWithEntitlementLock } = vi.hoisted(() => ({
  mockWithEntitlementLock: vi.fn(),
}));

vi.mock('../../data/db/runDbClient.js', () => ({ default: {} }));

vi.mock('@inkeep/agents-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@inkeep/agents-core')>();
  return {
    ...actual,
    withEntitlementLock: mockWithEntitlementLock,
  };
});

import { getEntitlementMeta } from '@inkeep/agents-core/middleware';
import { requireEntitlement } from '../../middleware/requireEntitlement';

type Env = {
  Variables: {
    tenantId: string;
    userId: string;
    tenantRole: string;
  };
};

function createTestApp(config: {
  resourceType: string;
  countFn: (tenantId: string) => Promise<number>;
  label?: string;
}) {
  const app = new Hono<Env>();

  app.use('*', async (c, next) => {
    c.set('tenantId', 'org-1');
    await next();
  });

  const mw = requireEntitlement(config);
  app.use('*', mw);
  app.post('/resources', (c) => c.json({ created: true }, 201));

  return { app, mw };
}

describe('requireEntitlement', () => {
  it('allows request when under limit', async () => {
    mockWithEntitlementLock.mockImplementation(async (_db, _orgId, _rt, fn) => {
      return fn(5, {});
    });

    const { app } = createTestApp({
      resourceType: 'quota:project',
      countFn: async () => 3,
    });

    const res = await app.request('/resources', { method: 'POST' });
    expect(res.status).toBe(201);
  });

  it('blocks request when at limit with 402 response', async () => {
    mockWithEntitlementLock.mockImplementation(async (_db, _orgId, _rt, fn) => {
      return fn(2, {});
    });

    const { app } = createTestApp({
      resourceType: 'quota:project',
      countFn: async () => 2,
      label: 'Project',
    });

    const res = await app.request('/resources', { method: 'POST' });
    expect(res.status).toBe(402);

    const body = await res.json();
    expect(body.detail).toContain('Project limit reached (2/2)');
    expect(body.resourceType).toBe('quota:project');
    expect(body.current).toBe(2);
    expect(body.limit).toBe(2);
  });

  it('allows request when no entitlement row exists (uncapped)', async () => {
    mockWithEntitlementLock.mockImplementation(async (_db, _orgId, _rt, fn) => {
      return fn(null, {});
    });

    const { app } = createTestApp({
      resourceType: 'quota:project',
      countFn: async () => 100,
    });

    const res = await app.request('/resources', { method: 'POST' });
    expect(res.status).toBe(201);
  });

  it('allows request when no tenantId is set', async () => {
    const app = new Hono();
    app.use(
      '*',
      requireEntitlement({
        resourceType: 'quota:project',
        countFn: async () => 999,
      })
    );
    app.post('/resources', (c) => c.json({ created: true }, 201));

    const res = await app.request('/resources', { method: 'POST' });
    expect(res.status).toBe(201);
  });

  it('registers entitlement metadata on the middleware', () => {
    const mw = requireEntitlement({
      resourceType: 'quota:project',
      countFn: async () => 0,
      label: 'Project',
    });

    const meta = getEntitlementMeta(mw);
    expect(meta).toEqual({
      resourceType: 'quota:project',
      description: 'Subject to quota:project limit when configured for the organization',
    });
  });
});
