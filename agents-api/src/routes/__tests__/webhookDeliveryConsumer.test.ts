import { createMockLoggerModule } from '@inkeep/agents-core/test-utils';
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

vi.mock('../../logger', () => createMockLoggerModule().module);

import { fetchWithSsrfProtection, WebhookUrlSecurityError } from '../../utils/webhook-url-security';
import { POST } from '../webhookDeliveryConsumer';

const mockFetch = fetchWithSsrfProtection as ReturnType<typeof vi.fn>;

const validPayload = {
  destinationUrl: 'https://hook.example.com/endpoint',
  tenantId: 'tenant-1',
  projectId: 'project-1',
  agentId: 'agent-1',
  webhookDestinationId: 'dest-1',
  payload: { type: 'conversation.created', data: { conversation: {} } },
};

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/webhook-delivery', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('webhookDeliveryConsumer.POST', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('payload validation (poison-pill protection)', () => {
    it('returns 200 + drops message on malformed JSON', async () => {
      const req = makeRequest('not-valid-json{');
      const response = await POST(req);
      expect(response.status).toBe(200);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('returns 200 + drops message when body lacks data field', async () => {
      const response = await POST(makeRequest({ wrongShape: true }));
      expect(response.status).toBe(200);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('returns 200 + drops message on schema-validation failure (missing destinationUrl)', async () => {
      const { destinationUrl: _drop, ...incomplete } = validPayload;
      const response = await POST(makeRequest({ data: incomplete }));
      expect(response.status).toBe(200);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('returns 200 + drops message when destinationUrl is empty string', async () => {
      const response = await POST(makeRequest({ data: { ...validPayload, destinationUrl: '' } }));
      expect(response.status).toBe(200);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('returns 200 + drops message when payload field is wrong type', async () => {
      const response = await POST(
        makeRequest({ data: { ...validPayload, payload: 'not an object' } })
      );
      expect(response.status).toBe(200);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('custom headers', () => {
    it('spreads custom headers into the outbound fetch', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });
      const payloadWithHeaders = {
        ...validPayload,
        headers: { 'X-Api-Key': 'key-123', 'X-Trace': 'trace-1' },
      };

      await POST(makeRequest({ data: payloadWithHeaders }));

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

      await POST(makeRequest({ data: payloadWithOverrides }));

      const callArgs = mockFetch.mock.calls[0][1];
      expect(callArgs.headers['Content-Type']).toBe('application/json');
      expect(callArgs.headers['User-Agent']).toBe('Inkeep-Webhooks/1.0');
    });

    it('works when headers field is absent from payload', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });
      await POST(makeRequest({ data: validPayload }));

      const callArgs = mockFetch.mock.calls[0][1];
      expect(callArgs.headers['Content-Type']).toBe('application/json');
      expect(callArgs.headers['User-Agent']).toBe('Inkeep-Webhooks/1.0');
    });
  });

  describe('delivery + status-code mapping', () => {
    it('returns 200 on successful 2xx delivery', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });
      const response = await POST(makeRequest({ data: validPayload }));
      expect(response.status).toBe(200);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('returns 200 (consume, no retry) on non-retryable 4xx', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: () => Promise.resolve('Not Found'),
      });
      const response = await POST(makeRequest({ data: validPayload }));
      expect(response.status).toBe(200);
    });

    it('returns 200 on 403 (non-retryable auth failure)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        text: () => Promise.resolve(''),
      });
      const response = await POST(makeRequest({ data: validPayload }));
      expect(response.status).toBe(200);
    });

    it('returns 500 (retry) on 408 timeout', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 408,
        text: () => Promise.resolve(''),
      });
      const response = await POST(makeRequest({ data: validPayload }));
      expect(response.status).toBe(500);
    });

    it('returns 500 (retry) on 429 rate limited', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: () => Promise.resolve(''),
      });
      const response = await POST(makeRequest({ data: validPayload }));
      expect(response.status).toBe(500);
    });

    it('returns 500 (retry) on 5xx server error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 502,
        text: () => Promise.resolve(''),
      });
      const response = await POST(makeRequest({ data: validPayload }));
      expect(response.status).toBe(500);
    });

    it('returns 500 (retry) on network error / generic throw', async () => {
      mockFetch.mockRejectedValueOnce(new Error('connection refused'));
      const response = await POST(makeRequest({ data: validPayload }));
      expect(response.status).toBe(500);
    });

    it('returns 200 (consume, no retry) when SSRF protection blocks', async () => {
      mockFetch.mockRejectedValueOnce(new WebhookUrlSecurityError('URL resolves to private IP'));
      const response = await POST(makeRequest({ data: validPayload }));
      expect(response.status).toBe(200);
    });
  });
});
