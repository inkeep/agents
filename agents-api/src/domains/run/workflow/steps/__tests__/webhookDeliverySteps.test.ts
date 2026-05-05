import { createMockLoggerModule } from '@inkeep/agents-core/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../../utils/webhook-url-security', () => ({
  fetchWithSsrfProtection: vi.fn(),
  WebhookUrlSecurityError: class WebhookUrlSecurityError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'WebhookUrlSecurityError';
    }
  },
}));

vi.mock('../../../../run/services/blob-storage/file-security-errors', () => ({
  FileSecurityError: class FileSecurityError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'FileSecurityError';
    }
  },
}));

vi.mock('../../../../../logger', () => createMockLoggerModule().module);

import {
  fetchWithSsrfProtection,
  WebhookUrlSecurityError,
} from '../../../../../utils/webhook-url-security';
import { FileSecurityError } from '../../../../run/services/blob-storage/file-security-errors';
import { deliverWebhookStep } from '../webhookDeliverySteps';

const mockFetchWithSsrf = fetchWithSsrfProtection as ReturnType<typeof vi.fn>;

const baseParams = {
  destinationUrl: 'https://hook.example.com/endpoint',
  payload: { type: 'conversation.created', data: { conversationId: 'conv-1' } },
};

describe('webhookDeliverySteps', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('deliverWebhookStep', () => {
    it('sends POST request via SSRF-protected fetch', async () => {
      mockFetchWithSsrf.mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve(''),
      });

      const result = await deliverWebhookStep(baseParams);

      expect(result.success).toBe(true);
      expect(result.statusCode).toBe(200);
      expect(mockFetchWithSsrf).toHaveBeenCalledWith(
        'https://hook.example.com/endpoint',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(baseParams.payload),
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'User-Agent': 'Inkeep-Webhooks/1.0',
          }),
        })
      );
    });

    it('returns failure with status code on non-2xx response', async () => {
      mockFetchWithSsrf.mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal Server Error'),
      });

      const result = await deliverWebhookStep(baseParams);

      expect(result.success).toBe(false);
      expect(result.statusCode).toBe(500);
      expect(result.error).toBe('HTTP 500');
    });

    it('returns failure on network error', async () => {
      mockFetchWithSsrf.mockRejectedValue(new Error('ECONNREFUSED'));

      const result = await deliverWebhookStep(baseParams);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error delivering webhook');
      expect(result.statusCode).toBeUndefined();
    });

    it('returns sanitized error when SSRF protection blocks the request (WebhookUrlSecurityError)', async () => {
      mockFetchWithSsrf.mockRejectedValue(
        new WebhookUrlSecurityError('URL resolves to private IP')
      );

      const result = await deliverWebhookStep(baseParams);

      expect(result.success).toBe(false);
      expect(result.blocked).toBe(true);
      expect(result.error).toBe('Destination URL blocked');
      expect(result.statusCode).toBeUndefined();
    });

    it('returns sanitized error when SSRF protection blocks via FileSecurityError (real throw path)', async () => {
      mockFetchWithSsrf.mockRejectedValue(
        new FileSecurityError(
          'Blocked external file URL resolving to private or reserved IP: 127.0.0.1'
        )
      );

      const result = await deliverWebhookStep(baseParams);

      expect(result.success).toBe(false);
      expect(result.blocked).toBe(true);
      expect(result.error).toBe('Destination URL blocked');
      expect(result.statusCode).toBeUndefined();
    });

    it('handles 4xx responses correctly', async () => {
      mockFetchWithSsrf.mockResolvedValue({
        ok: false,
        status: 404,
        text: () => Promise.resolve('Not Found'),
      });

      const result = await deliverWebhookStep(baseParams);

      expect(result.success).toBe(false);
      expect(result.statusCode).toBe(404);
      expect(result.error).toBe('HTTP 404');
    });
  });
});
