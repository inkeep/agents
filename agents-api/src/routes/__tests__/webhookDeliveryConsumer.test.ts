import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../utils/webhook-url-security', async () => {
  const actual = await vi.importActual<typeof import('../../utils/webhook-url-security')>(
    '../../utils/webhook-url-security'
  );
  return {
    ...actual,
    fetchWithSsrfProtection: vi.fn(),
  };
});

const refs = vi.hoisted(() => ({ clearAll: null as unknown as () => void }));
vi.mock('../../logger', async () => {
  const { createMockLoggerModule } = await import('@inkeep/agents-core/test-utils');
  const result = createMockLoggerModule();
  refs.clearAll = result.clearAll;
  return result.module;
});

import { fetchWithSsrfProtection, WebhookUrlSecurityError } from '../../utils/webhook-url-security';
import { deliverWebhook, handleWebhookMessage } from '../webhookDeliveryConsumer';

const mockFetch = fetchWithSsrfProtection as ReturnType<typeof vi.fn>;

const validPayload = {
  destinationUrl: 'https://hook.example.com/endpoint',
  tenantId: 'tenant-1',
  projectId: 'project-1',
  agentId: 'agent-1',
  webhookDestinationId: 'dest-1',
  payload: { type: 'conversation.created', data: { conversation: {} } },
};

const fakeMeta = { messageId: 'msg-test-1' };

describe('handleWebhookMessage (poison-pill protection)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    refs.clearAll();
  });

  it('drops message and does not deliver when message is not an object', async () => {
    await handleWebhookMessage('not-an-object', fakeMeta);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('drops message when message is null', async () => {
    await handleWebhookMessage(null, fakeMeta);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('drops message when destinationUrl is missing', async () => {
    const { destinationUrl: _drop, ...incomplete } = validPayload;
    await handleWebhookMessage(incomplete, fakeMeta);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('drops message when destinationUrl is empty string', async () => {
    await handleWebhookMessage({ ...validPayload, destinationUrl: '' }, fakeMeta);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('drops message when payload field is wrong type', async () => {
    await handleWebhookMessage({ ...validPayload, payload: 'not an object' }, fakeMeta);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('delivers when message is a valid payload', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });
    await handleWebhookMessage(validPayload, fakeMeta);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

describe('deliverWebhook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    refs.clearAll();
  });

  describe('custom headers', () => {
    it('spreads custom headers into the outbound fetch', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });
      const payloadWithHeaders = {
        ...validPayload,
        headers: { 'X-Api-Key': 'key-123', 'X-Trace': 'trace-1' },
      };

      await deliverWebhook(payloadWithHeaders);

      const callArgs = mockFetch.mock.calls[0][1];
      expect(callArgs.headers).toMatchObject({
        'X-Api-Key': 'key-123',
        'X-Trace': 'trace-1',
        'Content-Type': 'application/json',
        'User-Agent': 'Inkeep-Webhooks/1.0',
      });
    });

    it('system headers override user-supplied Content-Type and User-Agent', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });
      const payloadWithOverrides = {
        ...validPayload,
        headers: { 'Content-Type': 'text/xml', 'User-Agent': 'HackerBot' },
      };

      await deliverWebhook(payloadWithOverrides);

      const callArgs = mockFetch.mock.calls[0][1];
      expect(callArgs.headers['Content-Type']).toBe('application/json');
      expect(callArgs.headers['User-Agent']).toBe('Inkeep-Webhooks/1.0');
    });

    it('works when headers field is absent from payload', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });
      await deliverWebhook(validPayload);

      const callArgs = mockFetch.mock.calls[0][1];
      expect(callArgs.headers['Content-Type']).toBe('application/json');
      expect(callArgs.headers['User-Agent']).toBe('Inkeep-Webhooks/1.0');
    });
  });

  describe('successful delivery', () => {
    it('resolves on 2xx response', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });
      await expect(deliverWebhook(validPayload)).resolves.toBeUndefined();
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('sends correct headers and body', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });
      await deliverWebhook(validPayload);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://hook.example.com/endpoint',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Inkeep-Webhooks/1.0',
          },
          body: JSON.stringify(validPayload.payload),
        })
      );
    });
  });

  describe('non-retryable responses (resolves, no throw)', () => {
    it('resolves on 404 (non-retryable 4xx)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: () => Promise.resolve('Not Found'),
      });
      await expect(deliverWebhook(validPayload)).resolves.toBeUndefined();
    });

    it('resolves on 403 (non-retryable auth failure)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        text: () => Promise.resolve(''),
      });
      await expect(deliverWebhook(validPayload)).resolves.toBeUndefined();
    });

    it('resolves when SSRF protection blocks', async () => {
      mockFetch.mockRejectedValueOnce(new WebhookUrlSecurityError('URL resolves to private IP'));
      await expect(deliverWebhook(validPayload)).resolves.toBeUndefined();
    });
  });

  describe('retryable responses (throws)', () => {
    it('throws on 408 timeout', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 408,
        text: () => Promise.resolve(''),
      });
      await expect(deliverWebhook(validPayload)).rejects.toThrow(
        'Webhook delivery to dest-1 failed with status 408'
      );
    });

    it('throws on 429 rate limited', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: () => Promise.resolve(''),
      });
      await expect(deliverWebhook(validPayload)).rejects.toThrow(
        'Webhook delivery to dest-1 failed with status 429'
      );
    });

    it('throws on 5xx server error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 502,
        text: () => Promise.resolve(''),
      });
      await expect(deliverWebhook(validPayload)).rejects.toThrow(
        'Webhook delivery to dest-1 failed with status 502'
      );
    });

    it('throws on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('connection refused'));
      await expect(deliverWebhook(validPayload)).rejects.toThrow('connection refused');
    });
  });
});
