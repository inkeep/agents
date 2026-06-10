import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ManageAppVariables } from '../../../../types/app';

// env is read by getSignozConfig() inside the route module; control it per-test.
const refs = vi.hoisted(() => ({
  env: {
    SIGNOZ_URL: undefined as string | undefined,
    SIGNOZ_API_KEY: undefined as string | undefined,
  },
}));
vi.mock('../../../../env', () => ({ env: refs.env }));

import signozApp from '../signoz';

// authorizeProject(c, undefined) only needs tenantId + userId on the context (projectId is
// undefined, so the per-project access check is skipped). Mount the route under a test app whose
// middleware sets those so requests reach the handler body.
function makeTestApp() {
  const app = new Hono<{ Variables: ManageAppVariables }>();
  app.use('*', async (c, next) => {
    c.set('tenantId', 'tenant-1');
    c.set('userId', 'system');
    c.set('tenantRole', 'admin');
    await next();
  });
  app.route('/', signozApp);
  return app;
}

function post(body: unknown) {
  return makeTestApp().request('/conversation-span-numbers', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /conversation-span-numbers', () => {
  beforeEach(() => {
    refs.env.SIGNOZ_URL = undefined;
    refs.env.SIGNOZ_API_KEY = undefined;
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns 400 when conversationId is missing', async () => {
    const res = await post({});
    expect(res.status).toBe(400);
  });

  it('returns 500 when SigNoz is not configured', async () => {
    // SIGNOZ_URL / SIGNOZ_API_KEY unset -> getSignozConfig() returns null.
    const res = await post({ conversationId: 'conv-1' });
    expect(res.status).toBe(500);
  });

  it('returns the SigNoz number bundle on a successful round-trip', async () => {
    refs.env.SIGNOZ_URL = 'http://signoz.test';
    refs.env.SIGNOZ_API_KEY = 'test-key';
    const upstream = { status: 'success', data: { data: { results: [{ data: [] }] } } };
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify(upstream),
    } as unknown as Response);

    const res = await post({ conversationId: 'conv-1', start: 1000, end: 2000 });

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await res.json()).toEqual(upstream);
  });
});
