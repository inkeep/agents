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

// Mock data access functions
const mockGetInstallationByGitHubId = vi.fn();
const mockUpdateInstallationStatusByGitHubId = vi.fn();
const mockDeleteInstallation = vi.fn();
const mockAddRepositories = vi.fn();
const mockRemoveRepositories = vi.fn();

vi.mock('@inkeep/agents-core', () => ({
  getInstallationByGitHubId: () => mockGetInstallationByGitHubId,
  updateInstallationStatusByGitHubId: () => mockUpdateInstallationStatusByGitHubId,
  deleteInstallation: () => mockDeleteInstallation,
  addRepositories: () => mockAddRepositories,
  removeRepositories: () => mockRemoveRepositories,
}));

vi.mock('../../../db/runDbClient', () => ({
  default: {},
}));

import webhooksApp, { verifyWebhookSignature } from '../../../github/routes/webhooks';

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
      const invalidSignature =
        'sha256=0000000000000000000000000000000000000000000000000000000000000000';
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
      expect(result.error).toBe('Invalid signature');
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
      const eventTypes = ['push', 'pull_request', 'ping', 'issues', 'check_run'];

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

  describe('Installation Event Handling', () => {
    let app: Hono;

    beforeEach(() => {
      vi.clearAllMocks();
      mockEnv.GITHUB_WEBHOOK_SECRET = 'test-webhook-secret';
      app = new Hono();
      app.route('/', webhooksApp);
    });

    describe('installation event - created action', () => {
      it('should activate pending installation on created event', async () => {
        const existingInstallation = {
          id: 'internal-id-123',
          tenantId: 'tenant-123',
          installationId: '12345678',
          status: 'pending',
          accountLogin: 'test-org',
        };
        mockGetInstallationByGitHubId.mockResolvedValue(existingInstallation);
        mockUpdateInstallationStatusByGitHubId.mockResolvedValue({
          ...existingInstallation,
          status: 'active',
        });
        mockAddRepositories.mockResolvedValue([]);

        const payload = JSON.stringify({
          action: 'created',
          installation: {
            id: 12345678,
            account: { login: 'test-org', id: 87654321, type: 'Organization' },
          },
          sender: { login: 'user', id: 111 },
        });
        const signature = generateSignature(payload, 'test-webhook-secret');

        const response = await app.request('/', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Hub-Signature-256': signature,
            'X-GitHub-Event': 'installation',
            'X-GitHub-Delivery': 'delivery-created',
          },
          body: payload,
        });

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data).toEqual({ received: true, action: 'created' });
        expect(mockGetInstallationByGitHubId).toHaveBeenCalledWith('12345678');
        expect(mockUpdateInstallationStatusByGitHubId).toHaveBeenCalledWith({
          gitHubInstallationId: '12345678',
          status: 'active',
        });
      });

      it('should not activate already active installation', async () => {
        const existingInstallation = {
          id: 'internal-id-123',
          tenantId: 'tenant-123',
          installationId: '12345678',
          status: 'active',
          accountLogin: 'test-org',
        };
        mockGetInstallationByGitHubId.mockResolvedValue(existingInstallation);

        const payload = JSON.stringify({
          action: 'created',
          installation: {
            id: 12345678,
            account: { login: 'test-org', id: 87654321, type: 'Organization' },
          },
          sender: { login: 'user', id: 111 },
        });
        const signature = generateSignature(payload, 'test-webhook-secret');

        const response = await app.request('/', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Hub-Signature-256': signature,
            'X-GitHub-Event': 'installation',
            'X-GitHub-Delivery': 'delivery-created-active',
          },
          body: payload,
        });

        expect(response.status).toBe(200);
        expect(mockUpdateInstallationStatusByGitHubId).not.toHaveBeenCalled();
      });

      it('should add repositories from created event if provided', async () => {
        const existingInstallation = {
          id: 'internal-id-123',
          tenantId: 'tenant-123',
          installationId: '12345678',
          status: 'active',
          accountLogin: 'test-org',
        };
        mockGetInstallationByGitHubId.mockResolvedValue(existingInstallation);
        mockAddRepositories.mockResolvedValue([
          { id: 'repo-1', repositoryId: '111' },
          { id: 'repo-2', repositoryId: '222' },
        ]);

        const payload = JSON.stringify({
          action: 'created',
          installation: {
            id: 12345678,
            account: { login: 'test-org', id: 87654321, type: 'Organization' },
          },
          repositories: [
            { id: 111, name: 'repo1', full_name: 'test-org/repo1', private: false },
            { id: 222, name: 'repo2', full_name: 'test-org/repo2', private: true },
          ],
          sender: { login: 'user', id: 111 },
        });
        const signature = generateSignature(payload, 'test-webhook-secret');

        const response = await app.request('/', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Hub-Signature-256': signature,
            'X-GitHub-Event': 'installation',
            'X-GitHub-Delivery': 'delivery-created-repos',
          },
          body: payload,
        });

        expect(response.status).toBe(200);
        expect(mockAddRepositories).toHaveBeenCalledWith({
          installationId: 'internal-id-123',
          repositories: [
            {
              repositoryId: '111',
              repositoryName: 'repo1',
              repositoryFullName: 'test-org/repo1',
              private: false,
            },
            {
              repositoryId: '222',
              repositoryName: 'repo2',
              repositoryFullName: 'test-org/repo2',
              private: true,
            },
          ],
        });
      });

      it('should log warning for unknown installation on created event', async () => {
        mockGetInstallationByGitHubId.mockResolvedValue(null);

        const payload = JSON.stringify({
          action: 'created',
          installation: {
            id: 12345678,
            account: { login: 'test-org', id: 87654321, type: 'Organization' },
          },
          sender: { login: 'user', id: 111 },
        });
        const signature = generateSignature(payload, 'test-webhook-secret');

        const response = await app.request('/', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Hub-Signature-256': signature,
            'X-GitHub-Event': 'installation',
            'X-GitHub-Delivery': 'delivery-created-unknown',
          },
          body: payload,
        });

        expect(response.status).toBe(200);
        expect(mockUpdateInstallationStatusByGitHubId).not.toHaveBeenCalled();
      });
    });

    describe('installation event - deleted action', () => {
      it('should soft delete existing installation', async () => {
        const existingInstallation = {
          id: 'internal-id-123',
          tenantId: 'tenant-123',
          installationId: '12345678',
          status: 'active',
        };
        mockGetInstallationByGitHubId.mockResolvedValue(existingInstallation);
        mockDeleteInstallation.mockResolvedValue(true);

        const payload = JSON.stringify({
          action: 'deleted',
          installation: {
            id: 12345678,
            account: { login: 'test-org', id: 87654321, type: 'Organization' },
          },
          sender: { login: 'user', id: 111 },
        });
        const signature = generateSignature(payload, 'test-webhook-secret');

        const response = await app.request('/', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Hub-Signature-256': signature,
            'X-GitHub-Event': 'installation',
            'X-GitHub-Delivery': 'delivery-deleted',
          },
          body: payload,
        });

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data).toEqual({ received: true, action: 'deleted' });
        expect(mockDeleteInstallation).toHaveBeenCalledWith({
          tenantId: 'tenant-123',
          id: 'internal-id-123',
        });
      });

      it('should handle deleted event for unknown installation', async () => {
        mockGetInstallationByGitHubId.mockResolvedValue(null);

        const payload = JSON.stringify({
          action: 'deleted',
          installation: {
            id: 12345678,
            account: { login: 'test-org', id: 87654321, type: 'Organization' },
          },
          sender: { login: 'user', id: 111 },
        });
        const signature = generateSignature(payload, 'test-webhook-secret');

        const response = await app.request('/', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Hub-Signature-256': signature,
            'X-GitHub-Event': 'installation',
            'X-GitHub-Delivery': 'delivery-deleted-unknown',
          },
          body: payload,
        });

        expect(response.status).toBe(200);
        expect(mockDeleteInstallation).not.toHaveBeenCalled();
      });
    });

    describe('installation event - suspend action', () => {
      it('should suspend existing installation', async () => {
        const existingInstallation = {
          id: 'internal-id-123',
          tenantId: 'tenant-123',
          installationId: '12345678',
          status: 'active',
        };
        mockGetInstallationByGitHubId.mockResolvedValue(existingInstallation);
        mockUpdateInstallationStatusByGitHubId.mockResolvedValue({
          ...existingInstallation,
          status: 'suspended',
        });

        const payload = JSON.stringify({
          action: 'suspend',
          installation: {
            id: 12345678,
            account: { login: 'test-org', id: 87654321, type: 'Organization' },
          },
          sender: { login: 'user', id: 111 },
        });
        const signature = generateSignature(payload, 'test-webhook-secret');

        const response = await app.request('/', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Hub-Signature-256': signature,
            'X-GitHub-Event': 'installation',
            'X-GitHub-Delivery': 'delivery-suspend',
          },
          body: payload,
        });

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data).toEqual({ received: true, action: 'suspend' });
        expect(mockUpdateInstallationStatusByGitHubId).toHaveBeenCalledWith({
          gitHubInstallationId: '12345678',
          status: 'suspended',
        });
      });
    });

    describe('installation event - unsuspend action', () => {
      it('should unsuspend existing installation', async () => {
        const existingInstallation = {
          id: 'internal-id-123',
          tenantId: 'tenant-123',
          installationId: '12345678',
          status: 'suspended',
        };
        mockGetInstallationByGitHubId.mockResolvedValue(existingInstallation);
        mockUpdateInstallationStatusByGitHubId.mockResolvedValue({
          ...existingInstallation,
          status: 'active',
        });

        const payload = JSON.stringify({
          action: 'unsuspend',
          installation: {
            id: 12345678,
            account: { login: 'test-org', id: 87654321, type: 'Organization' },
          },
          sender: { login: 'user', id: 111 },
        });
        const signature = generateSignature(payload, 'test-webhook-secret');

        const response = await app.request('/', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Hub-Signature-256': signature,
            'X-GitHub-Event': 'installation',
            'X-GitHub-Delivery': 'delivery-unsuspend',
          },
          body: payload,
        });

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data).toEqual({ received: true, action: 'unsuspend' });
        expect(mockUpdateInstallationStatusByGitHubId).toHaveBeenCalledWith({
          gitHubInstallationId: '12345678',
          status: 'active',
        });
      });
    });

    describe('installation event - new_permissions_accepted action', () => {
      it('should acknowledge new_permissions_accepted without database changes', async () => {
        const payload = JSON.stringify({
          action: 'new_permissions_accepted',
          installation: {
            id: 12345678,
            account: { login: 'test-org', id: 87654321, type: 'Organization' },
          },
          sender: { login: 'user', id: 111 },
        });
        const signature = generateSignature(payload, 'test-webhook-secret');

        const response = await app.request('/', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Hub-Signature-256': signature,
            'X-GitHub-Event': 'installation',
            'X-GitHub-Delivery': 'delivery-permissions',
          },
          body: payload,
        });

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data).toEqual({ received: true, action: 'new_permissions_accepted' });
        expect(mockGetInstallationByGitHubId).not.toHaveBeenCalled();
      });
    });

    describe('installation event - error handling', () => {
      it('should return 200 even when database operation fails', async () => {
        mockGetInstallationByGitHubId.mockRejectedValue(new Error('Database error'));

        const payload = JSON.stringify({
          action: 'suspend',
          installation: {
            id: 12345678,
            account: { login: 'test-org', id: 87654321, type: 'Organization' },
          },
          sender: { login: 'user', id: 111 },
        });
        const signature = generateSignature(payload, 'test-webhook-secret');

        const response = await app.request('/', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Hub-Signature-256': signature,
            'X-GitHub-Event': 'installation',
            'X-GitHub-Delivery': 'delivery-error',
          },
          body: payload,
        });

        // Should still return 200 to acknowledge receipt (GitHub retries on 5xx)
        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.received).toBe(true);
        expect(data.error).toBe('Processing failed');
      });
    });
  });

  describe('Installation Repositories Event Handling', () => {
    let app: Hono;

    beforeEach(() => {
      vi.clearAllMocks();
      mockEnv.GITHUB_WEBHOOK_SECRET = 'test-webhook-secret';
      app = new Hono();
      app.route('/', webhooksApp);
    });

    describe('installation_repositories event - added action', () => {
      it('should add repositories when they are added to installation', async () => {
        const existingInstallation = {
          id: 'internal-id-123',
          tenantId: 'tenant-123',
          installationId: '12345678',
          status: 'active',
        };
        mockGetInstallationByGitHubId.mockResolvedValue(existingInstallation);
        mockAddRepositories.mockResolvedValue([
          { id: 'repo-1', repositoryId: '111' },
          { id: 'repo-2', repositoryId: '222' },
        ]);

        const payload = JSON.stringify({
          action: 'added',
          installation: {
            id: 12345678,
            account: { login: 'test-org', id: 87654321, type: 'Organization' },
          },
          repositories_added: [
            { id: 111, name: 'repo1', full_name: 'test-org/repo1', private: false },
            { id: 222, name: 'repo2', full_name: 'test-org/repo2', private: true },
          ],
          repositories_removed: [],
          sender: { login: 'user', id: 111 },
        });
        const signature = generateSignature(payload, 'test-webhook-secret');

        const response = await app.request('/', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Hub-Signature-256': signature,
            'X-GitHub-Event': 'installation_repositories',
            'X-GitHub-Delivery': 'delivery-repos-added',
          },
          body: payload,
        });

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data).toEqual({ received: true, action: 'added' });
        expect(mockAddRepositories).toHaveBeenCalledWith({
          installationId: 'internal-id-123',
          repositories: [
            {
              repositoryId: '111',
              repositoryName: 'repo1',
              repositoryFullName: 'test-org/repo1',
              private: false,
            },
            {
              repositoryId: '222',
              repositoryName: 'repo2',
              repositoryFullName: 'test-org/repo2',
              private: true,
            },
          ],
        });
      });
    });

    describe('installation_repositories event - removed action', () => {
      it('should remove repositories when they are removed from installation', async () => {
        const existingInstallation = {
          id: 'internal-id-123',
          tenantId: 'tenant-123',
          installationId: '12345678',
          status: 'active',
        };
        mockGetInstallationByGitHubId.mockResolvedValue(existingInstallation);
        mockRemoveRepositories.mockResolvedValue(2);

        const payload = JSON.stringify({
          action: 'removed',
          installation: {
            id: 12345678,
            account: { login: 'test-org', id: 87654321, type: 'Organization' },
          },
          repositories_added: [],
          repositories_removed: [
            { id: 111, name: 'repo1', full_name: 'test-org/repo1', private: false },
            { id: 222, name: 'repo2', full_name: 'test-org/repo2', private: true },
          ],
          sender: { login: 'user', id: 111 },
        });
        const signature = generateSignature(payload, 'test-webhook-secret');

        const response = await app.request('/', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Hub-Signature-256': signature,
            'X-GitHub-Event': 'installation_repositories',
            'X-GitHub-Delivery': 'delivery-repos-removed',
          },
          body: payload,
        });

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data).toEqual({ received: true, action: 'removed' });
        expect(mockRemoveRepositories).toHaveBeenCalledWith({
          installationId: 'internal-id-123',
          repositoryIds: ['111', '222'],
        });
      });
    });

    describe('installation_repositories event - unknown installation', () => {
      it('should return warning for unknown installation', async () => {
        mockGetInstallationByGitHubId.mockResolvedValue(null);

        const payload = JSON.stringify({
          action: 'added',
          installation: {
            id: 12345678,
            account: { login: 'test-org', id: 87654321, type: 'Organization' },
          },
          repositories_added: [
            { id: 111, name: 'repo1', full_name: 'test-org/repo1', private: false },
          ],
          repositories_removed: [],
          sender: { login: 'user', id: 111 },
        });
        const signature = generateSignature(payload, 'test-webhook-secret');

        const response = await app.request('/', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Hub-Signature-256': signature,
            'X-GitHub-Event': 'installation_repositories',
            'X-GitHub-Delivery': 'delivery-repos-unknown',
          },
          body: payload,
        });

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data).toEqual({ received: true, warning: 'Unknown installation' });
        expect(mockAddRepositories).not.toHaveBeenCalled();
      });
    });

    describe('installation_repositories event - deleted installation', () => {
      it('should skip events for deleted installations', async () => {
        const existingInstallation = {
          id: 'internal-id-123',
          tenantId: 'tenant-123',
          installationId: '12345678',
          status: 'deleted',
        };
        mockGetInstallationByGitHubId.mockResolvedValue(existingInstallation);

        const payload = JSON.stringify({
          action: 'added',
          installation: {
            id: 12345678,
            account: { login: 'test-org', id: 87654321, type: 'Organization' },
          },
          repositories_added: [
            { id: 111, name: 'repo1', full_name: 'test-org/repo1', private: false },
          ],
          repositories_removed: [],
          sender: { login: 'user', id: 111 },
        });
        const signature = generateSignature(payload, 'test-webhook-secret');

        const response = await app.request('/', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Hub-Signature-256': signature,
            'X-GitHub-Event': 'installation_repositories',
            'X-GitHub-Delivery': 'delivery-repos-deleted-install',
          },
          body: payload,
        });

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data).toEqual({ received: true, skipped: 'Installation deleted' });
        expect(mockAddRepositories).not.toHaveBeenCalled();
      });
    });

    describe('installation_repositories event - error handling', () => {
      it('should return 200 even when database operation fails', async () => {
        mockGetInstallationByGitHubId.mockRejectedValue(new Error('Database error'));

        const payload = JSON.stringify({
          action: 'added',
          installation: {
            id: 12345678,
            account: { login: 'test-org', id: 87654321, type: 'Organization' },
          },
          repositories_added: [
            { id: 111, name: 'repo1', full_name: 'test-org/repo1', private: false },
          ],
          repositories_removed: [],
          sender: { login: 'user', id: 111 },
        });
        const signature = generateSignature(payload, 'test-webhook-secret');

        const response = await app.request('/', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Hub-Signature-256': signature,
            'X-GitHub-Event': 'installation_repositories',
            'X-GitHub-Delivery': 'delivery-repos-error',
          },
          body: payload,
        });

        // Should still return 200 to acknowledge receipt
        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.received).toBe(true);
        expect(data.error).toBe('Processing failed');
      });
    });
  });
});
