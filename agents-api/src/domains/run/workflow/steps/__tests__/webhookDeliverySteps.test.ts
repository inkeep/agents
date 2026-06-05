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

vi.mock('@inkeep/agents-core/external-fetch', () => ({
  FileSecurityError: class FileSecurityError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'FileSecurityError';
    }
  },
}));

vi.mock('../../../../../logger', () => createMockLoggerModule().module);

import { FileSecurityError } from '@inkeep/agents-core/external-fetch';
import {
  fetchWithSsrfProtection,
  WebhookUrlSecurityError,
} from '../../../../../utils/webhook-url-security';
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
      expect(result.error).toBe('Destination URL blocked');
      expect(result.statusCode).toBeUndefined();
    });

    it('includes custom headers in the outbound fetch', async () => {
      mockFetchWithSsrf.mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve(''),
      });

      await deliverWebhookStep({
        ...baseParams,
        headers: { 'X-Api-Key': 'secret', 'X-Trace-Id': 'trace-1' },
      });

      const callArgs = mockFetchWithSsrf.mock.calls[0][1];
      expect(callArgs.headers).toMatchObject({
        'X-Api-Key': 'secret',
        'X-Trace-Id': 'trace-1',
        'Content-Type': 'application/json',
        'User-Agent': 'Inkeep-Webhooks/1.0',
      });
    });

    it('system headers override user-supplied Content-Type and User-Agent', async () => {
      mockFetchWithSsrf.mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve(''),
      });

      await deliverWebhookStep({
        ...baseParams,
        headers: {
          'Content-Type': 'text/plain',
          'User-Agent': 'EvilBot/1.0',
          'X-Safe': 'allowed',
        },
      });

      const callArgs = mockFetchWithSsrf.mock.calls[0][1];
      expect(callArgs.headers['Content-Type']).toBe('application/json');
      expect(callArgs.headers['User-Agent']).toBe('Inkeep-Webhooks/1.0');
      expect(callArgs.headers['X-Safe']).toBe('allowed');
    });

    it('works when headers is null', async () => {
      mockFetchWithSsrf.mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve(''),
      });

      await deliverWebhookStep({ ...baseParams, headers: null });

      const callArgs = mockFetchWithSsrf.mock.calls[0][1];
      expect(callArgs.headers['Content-Type']).toBe('application/json');
      expect(callArgs.headers['User-Agent']).toBe('Inkeep-Webhooks/1.0');
    });

    it('works when headers is undefined', async () => {
      mockFetchWithSsrf.mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve(''),
      });

      await deliverWebhookStep({ ...baseParams, headers: undefined });

      const callArgs = mockFetchWithSsrf.mock.calls[0][1];
      expect(callArgs.headers['Content-Type']).toBe('application/json');
      expect(callArgs.headers['User-Agent']).toBe('Inkeep-Webhooks/1.0');
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
