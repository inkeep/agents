import crypto from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { vercelChecksWebhookHandler } from '../../domains/manage/routes/vercelChecks/handler';

vi.mock('../../env', () => ({
  env: {
    VERCEL_CHECKS_ENABLED: false,
  },
}));

vi.mock('../../logger', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock('../../domains/manage/routes/vercelChecks/client', () => ({
  createCheck: vi.fn(),
  updateCheck: vi.fn(),
}));

function createSignature(body: string, secret: string): string {
  return crypto.createHmac('sha1', secret).update(body).digest('hex');
}

describe('Vercel Checks Webhook Handler', () => {
  const mockIntegrationSecret = 'test-integration-secret';
  const mockChecksToken = 'test-checks-token';
  const mockTeamId = 'team_test123';

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  describe('when Vercel Checks is disabled', () => {
    beforeEach(async () => {
      vi.doMock('../../env', () => ({
        env: {
          VERCEL_CHECKS_ENABLED: false,
        },
      }));
    });

    it('should return 404 when VERCEL_CHECKS_ENABLED is false', async () => {
      const request = new Request('http://localhost/checks-webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ type: 'deployment.created' }),
      });

      const response = await vercelChecksWebhookHandler.request(request);

      expect(response.status).toBe(404);
      const body = await response.json();
      expect(body).toEqual({ error: 'Not Found' });
    });
  });

  describe('when Vercel Checks is enabled', () => {
    beforeEach(async () => {
      vi.resetModules();

      vi.doMock('../../env', () => ({
        env: {
          VERCEL_CHECKS_ENABLED: true,
          VERCEL_INTEGRATION_SECRET: mockIntegrationSecret,
          VERCEL_CHECKS_TOKEN: mockChecksToken,
          VERCEL_TEAM_ID: mockTeamId,
        },
      }));

      vi.doMock('../../logger', () => ({
        getLogger: () => ({
          info: vi.fn(),
          warn: vi.fn(),
          error: vi.fn(),
          debug: vi.fn(),
        }),
      }));

      vi.doMock('../../domains/manage/routes/vercelChecks/client', () => ({
        createCheck: vi.fn().mockResolvedValue({
          id: 'check_abc123',
          name: 'Readiness Check',
          status: 'registered',
          blocking: true,
        }),
        updateCheck: vi.fn().mockResolvedValue({
          id: 'check_abc123',
          name: 'Readiness Check',
          status: 'completed',
          conclusion: 'succeeded',
          blocking: true,
        }),
      }));
    });

    it('should return 401 when signature is missing', async () => {
      const { vercelChecksWebhookHandler: handler } = await import(
        '../../domains/manage/routes/vercelChecks/handler'
      );

      const request = new Request('http://localhost/checks-webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ type: 'deployment.created' }),
      });

      const response = await handler.request(request);

      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body).toEqual({ error: 'Unauthorized' });
    });

    it('should return 401 when signature is invalid', async () => {
      const { vercelChecksWebhookHandler: handler } = await import(
        '../../domains/manage/routes/vercelChecks/handler'
      );

      const body = JSON.stringify({ type: 'deployment.created' });

      const request = new Request('http://localhost/checks-webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-vercel-signature': 'invalid-signature',
        },
        body,
      });

      const response = await handler.request(request);

      expect(response.status).toBe(401);
    });

    it('should return 400 for invalid JSON payload', async () => {
      const { vercelChecksWebhookHandler: handler } = await import(
        '../../domains/manage/routes/vercelChecks/handler'
      );

      const body = 'not-valid-json';
      const signature = createSignature(body, mockIntegrationSecret);

      const request = new Request('http://localhost/checks-webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-vercel-signature': signature,
        },
        body,
      });

      const response = await handler.request(request);

      expect(response.status).toBe(400);
      const responseBody = await response.json();
      expect(responseBody).toEqual({ error: 'Bad Request' });
    });

    it('should return 400 for invalid webhook payload schema', async () => {
      const { vercelChecksWebhookHandler: handler } = await import(
        '../../domains/manage/routes/vercelChecks/handler'
      );

      const body = JSON.stringify({ type: 'invalid.event' });
      const signature = createSignature(body, mockIntegrationSecret);

      const request = new Request('http://localhost/checks-webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-vercel-signature': signature,
        },
        body,
      });

      const response = await handler.request(request);

      expect(response.status).toBe(400);
      const responseBody = await response.json();
      expect(responseBody.error).toBe('Bad Request');
      expect(responseBody.details).toBeDefined();
    });

    it('should handle deployment.created event and register blocking check', async () => {
      const { vercelChecksWebhookHandler: handler } = await import(
        '../../domains/manage/routes/vercelChecks/handler'
      );
      const { createCheck } = await import('../../domains/manage/routes/vercelChecks/client');

      const payload = {
        id: 'evt_test123',
        type: 'deployment.created',
        createdAt: Date.now(),
        payload: {
          deployment: {
            id: 'dpl_test123',
            name: 'my-project',
            url: 'my-project-abc123.vercel.app',
            target: 'preview',
          },
        },
      };

      const body = JSON.stringify(payload);
      const signature = createSignature(body, mockIntegrationSecret);

      const request = new Request('http://localhost/checks-webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-vercel-signature': signature,
        },
        body,
      });

      const response = await handler.request(request);

      expect(response.status).toBe(200);
      const responseBody = await response.json();
      expect(responseBody).toEqual({ received: true });

      expect(createCheck).toHaveBeenCalledWith(
        'dpl_test123',
        {
          name: 'Readiness Check',
          blocking: true,
          rerequestable: true,
        },
        {
          token: mockChecksToken,
          teamId: mockTeamId,
        }
      );
    });

    it('should handle deployment.ready event and perform readiness check', async () => {
      const mockFetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/ready')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ status: 'ok', manageDb: true, runDb: true }),
          });
        }
        if (url.includes('/checks')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                checks: [{ id: 'check_abc123', name: 'Readiness Check' }],
              }),
          });
        }
        return Promise.resolve({ ok: false, status: 404 });
      });
      vi.stubGlobal('fetch', mockFetch);

      const { vercelChecksWebhookHandler: handler } = await import(
        '../../domains/manage/routes/vercelChecks/handler'
      );
      const { updateCheck } = await import('../../domains/manage/routes/vercelChecks/client');

      const payload = {
        id: 'evt_test456',
        type: 'deployment.ready',
        createdAt: Date.now(),
        payload: {
          deployment: {
            id: 'dpl_test123',
            name: 'my-project',
            url: 'my-project-abc123.vercel.app',
            target: 'preview',
            readyState: 'READY',
          },
        },
      };

      const body = JSON.stringify(payload);
      const signature = createSignature(body, mockIntegrationSecret);

      const request = new Request('http://localhost/checks-webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-vercel-signature': signature,
        },
        body,
      });

      const response = await handler.request(request);

      expect(response.status).toBe(200);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://my-project-abc123.vercel.app/ready',
        expect.objectContaining({
          method: 'GET',
        })
      );

      expect(updateCheck).toHaveBeenCalledWith(
        'dpl_test123',
        'check_abc123',
        { conclusion: 'succeeded' },
        { token: mockChecksToken, teamId: mockTeamId }
      );
    });

    it('should handle deployment.ready event when readiness check fails', async () => {
      const mockFetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/ready')) {
          return Promise.resolve({
            ok: false,
            status: 503,
          });
        }
        if (url.includes('/checks')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                checks: [{ id: 'check_abc123', name: 'Readiness Check' }],
              }),
          });
        }
        return Promise.resolve({ ok: false, status: 404 });
      });
      vi.stubGlobal('fetch', mockFetch);

      const { vercelChecksWebhookHandler: handler } = await import(
        '../../domains/manage/routes/vercelChecks/handler'
      );
      const { updateCheck } = await import('../../domains/manage/routes/vercelChecks/client');

      const payload = {
        id: 'evt_test456',
        type: 'deployment.ready',
        createdAt: Date.now(),
        payload: {
          deployment: {
            id: 'dpl_test123',
            name: 'my-project',
            url: 'my-project-abc123.vercel.app',
            target: 'preview',
            readyState: 'READY',
          },
        },
      };

      const body = JSON.stringify(payload);
      const signature = createSignature(body, mockIntegrationSecret);

      const request = new Request('http://localhost/checks-webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-vercel-signature': signature,
        },
        body,
      });

      await handler.request(request);

      expect(updateCheck).toHaveBeenCalledWith(
        'dpl_test123',
        'check_abc123',
        { conclusion: 'failed' },
        expect.any(Object)
      );
    });

    it('should handle deployment.check-rerequested event', async () => {
      const mockFetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/ready')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ status: 'ok' }),
          });
        }
        return Promise.resolve({ ok: false, status: 404 });
      });
      vi.stubGlobal('fetch', mockFetch);

      const { vercelChecksWebhookHandler: handler } = await import(
        '../../domains/manage/routes/vercelChecks/handler'
      );
      const { updateCheck } = await import('../../domains/manage/routes/vercelChecks/client');

      const payload = {
        id: 'evt_test789',
        type: 'deployment.check-rerequested',
        createdAt: Date.now(),
        payload: {
          deployment: {
            id: 'dpl_test123',
            name: 'my-project',
            url: 'my-project-abc123.vercel.app',
            target: 'preview',
          },
          check: {
            id: 'check_abc123',
            name: 'Readiness Check',
          },
        },
      };

      const body = JSON.stringify(payload);
      const signature = createSignature(body, mockIntegrationSecret);

      const request = new Request('http://localhost/checks-webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-vercel-signature': signature,
        },
        body,
      });

      const response = await handler.request(request);

      expect(response.status).toBe(200);

      expect(updateCheck).toHaveBeenCalledWith(
        'dpl_test123',
        'check_abc123',
        { conclusion: 'succeeded' },
        expect.any(Object)
      );
    });
  });
});
