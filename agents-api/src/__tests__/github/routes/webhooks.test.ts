import { createHmac } from 'node:crypto';
import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockEnv = vi.hoisted(() => ({
  GITHUB_WEBHOOK_SECRET: 'test-webhook-secret',
}));

vi.mock('../../../env', () => ({
  env: mockEnv,
}));

vi.mock('../../../logger', () => ({
  getLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    child: vi.fn().mockReturnThis(),
  }),
}));

import webhooksApp, { verifyWebhookSignature } from '../../../domains/github/routes/webhooks';

function generateSignature(payload: string, secret: string): string {
  const hmac = createHmac('sha256', secret);
  hmac.update(payload);
  return `sha256=${hmac.digest('hex')}`;
}

describe('GitHub Webhooks', () => {
  describe('verifyWebhookSignature', () => {
    const secret = 'test-secret';
    const payload = '{"action":"opened"}';

    it('should return success for valid signature', () => {
      const signature = generateSignature(payload, secret);
      const result = verifyWebhookSignature(payload, signature, secret);

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should return error for missing signature', () => {
      const result = verifyWebhookSignature(payload, undefined, secret);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Missing X-Hub-Signature-256 header');
    });

    it('should return error for signature without sha256= prefix', () => {
      const hmac = createHmac('sha256', secret);
      hmac.update(payload);
      const rawSignature = hmac.digest('hex');

      const result = verifyWebhookSignature(payload, rawSignature, secret);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid signature format');
    });

    it('should return error for invalid signature', () => {
      const invalidSignature = 'sha256=0000000000000000000000000000000000000000000000000000000000000000';
      const result = verifyWebhookSignature(payload, invalidSignature, secret);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid signature');
    });

    it('should return error for signature with wrong secret', () => {
      const signature = generateSignature(payload, 'wrong-secret');
      const result = verifyWebhookSignature(payload, signature, secret);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid signature');
    });

    it('should return error for tampered payload', () => {
      const signature = generateSignature(payload, secret);
      const tamperedPayload = '{"action":"closed"}';
      const result = verifyWebhookSignature(tamperedPayload, signature, secret);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid signature');
    });

    it('should return error for malformed hex signature', () => {
      const result = verifyWebhookSignature(payload, 'sha256=not-valid-hex!@#$', secret);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid signature format');
    });

    it('should return error for signature with wrong length', () => {
      const result = verifyWebhookSignature(payload, 'sha256=abcd', secret);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid signature');
    });
  });

  describe('POST /webhooks endpoint', () => {
    let app: Hono;

    beforeEach(() => {
      vi.clearAllMocks();
      mockEnv.GITHUB_WEBHOOK_SECRET = 'test-webhook-secret';
      app = new Hono();
      app.route('/', webhooksApp);
    });

    it('should accept webhook with valid signature and return 200 for unhandled event', async () => {
      const payload = JSON.stringify({ action: 'opened' });
      const signature = generateSignature(payload, 'test-webhook-secret');

      const response = await app.request('/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Hub-Signature-256': signature,
          'X-GitHub-Event': 'issues',
          'X-GitHub-Delivery': 'delivery-123',
        },
        body: payload,
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toEqual({ received: true });
    });

    it('should return 401 for missing signature', async () => {
      const payload = JSON.stringify({ action: 'opened' });

      const response = await app.request('/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-GitHub-Event': 'issues',
          'X-GitHub-Delivery': 'delivery-123',
        },
        body: payload,
      });

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe('Missing X-Hub-Signature-256 header');
    });

    it('should return 401 for invalid signature', async () => {
      const payload = JSON.stringify({ action: 'opened' });
      const invalidSignature =
        'sha256=0000000000000000000000000000000000000000000000000000000000000000';

      const response = await app.request('/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Hub-Signature-256': invalidSignature,
          'X-GitHub-Event': 'issues',
          'X-GitHub-Delivery': 'delivery-123',
        },
        body: payload,
      });

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe('Invalid signature');
    });

    it('should return 400 for missing X-GitHub-Event header', async () => {
      const payload = JSON.stringify({ action: 'opened' });
      const signature = generateSignature(payload, 'test-webhook-secret');

      const response = await app.request('/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Hub-Signature-256': signature,
          'X-GitHub-Delivery': 'delivery-123',
        },
        body: payload,
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Missing X-GitHub-Event header');
    });

    it('should return 500 when webhook secret not configured', async () => {
      mockEnv.GITHUB_WEBHOOK_SECRET = '';
      const payload = JSON.stringify({ action: 'opened' });

      const response = await app.request('/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-GitHub-Event': 'issues',
        },
        body: payload,
      });

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error).toBe('GitHub webhook secret not configured');
    });

    it('should handle various GitHub event types', async () => {
      const eventTypes = [
        'installation',
        'installation_repositories',
        'push',
        'pull_request',
        'ping',
      ];

      for (const eventType of eventTypes) {
        const payload = JSON.stringify({ action: 'created' });
        const signature = generateSignature(payload, 'test-webhook-secret');

        const response = await app.request('/', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Hub-Signature-256': signature,
            'X-GitHub-Event': eventType,
            'X-GitHub-Delivery': `delivery-${eventType}`,
          },
          body: payload,
        });

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data).toEqual({ received: true });
      }
    });

    it('should verify signature correctly with complex JSON payload', async () => {
      const payload = JSON.stringify({
        action: 'opened',
        installation: {
          id: 12345678,
          account: {
            login: 'test-org',
            id: 87654321,
            type: 'Organization',
          },
        },
        repositories: [
          { id: 111, name: 'repo1', full_name: 'test-org/repo1', private: false },
          { id: 222, name: 'repo2', full_name: 'test-org/repo2', private: true },
        ],
      });
      const signature = generateSignature(payload, 'test-webhook-secret');

      const response = await app.request('/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Hub-Signature-256': signature,
          'X-GitHub-Event': 'installation',
          'X-GitHub-Delivery': 'delivery-complex',
        },
        body: payload,
      });

      expect(response.status).toBe(200);
    });

    it('should reject tampered payload', async () => {
      const originalPayload = JSON.stringify({ action: 'opened' });
      const signature = generateSignature(originalPayload, 'test-webhook-secret');
      const tamperedPayload = JSON.stringify({ action: 'closed' });

      const response = await app.request('/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Hub-Signature-256': signature,
          'X-GitHub-Event': 'issues',
          'X-GitHub-Delivery': 'delivery-tampered',
        },
        body: tamperedPayload,
      });

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe('Invalid signature');
    });
  });
});
