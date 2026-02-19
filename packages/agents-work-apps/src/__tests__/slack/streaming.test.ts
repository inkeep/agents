/**
 * Tests for streamAgentResponse — SSE streaming to Slack
 *
 * Tests critical paths:
 * - Timeout handling
 * - API error responses
 * - Missing response body
 * - Successful streaming flow
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockFetch } = vi.hoisted(() => ({
  mockFetch: vi.fn(),
}));

vi.mock('@inkeep/agents-core', async (importOriginal) => {
  const original = await importOriginal<typeof import('@inkeep/agents-core')>();
  return {
    ...original,
    getInProcessFetch: vi.fn(() => mockFetch),
  };
});

vi.mock('../../env', () => ({
  env: {
    INKEEP_AGENTS_API_URL: 'http://localhost:3002',
  },
}));

vi.mock('../../logger', () => ({
  getLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import { getInProcessFetch } from '@inkeep/agents-core';
import { streamAgentResponse } from '../../slack/services/events/streaming';

const mockPostMessage = vi.fn().mockResolvedValue({ ok: true });
const mockPostEphemeral = vi.fn().mockResolvedValue({ ok: true });
const mockChatDelete = vi.fn().mockResolvedValue({ ok: true });
const mockStreamAppend = vi.fn().mockResolvedValue(undefined);
const mockStreamStop = vi.fn().mockResolvedValue(undefined);

const mockSlackClient = {
  chat: {
    postMessage: mockPostMessage,
    postEphemeral: mockPostEphemeral,
    delete: mockChatDelete,
  },
  chatStream: vi.fn().mockReturnValue({
    append: mockStreamAppend,
    stop: mockStreamStop,
  }),
};

const baseParams = {
  slackClient: mockSlackClient as any,
  channel: 'C456',
  threadTs: '1234.5678',
  thinkingMessageTs: '1234.9999',
  slackUserId: 'U123',
  teamId: 'T789',
  jwtToken: 'mock-jwt',
  projectId: 'proj-1',
  agentId: 'agent-1',
  question: 'What is Inkeep?',
  agentName: 'Test Agent',
  conversationId: 'conv-123',
};

describe('streamAgentResponse', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('should handle non-ok API response', async () => {
    mockFetch.mockResolvedValue(new Response('Internal Server Error', { status: 500 }));

    const result = await streamAgentResponse(baseParams);

    expect(getInProcessFetch).toHaveBeenCalled();
    expect(result.success).toBe(false);
    expect(result.errorType).toBeDefined();
    expect(mockPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'C456',
        thread_ts: '1234.5678',
      })
    );
  });

  it('should handle missing response body', async () => {
    const response = new Response(null, { status: 200 });
    Object.defineProperty(response, 'body', { value: null });
    mockFetch.mockResolvedValue(response);

    const result = await streamAgentResponse(baseParams);

    expect(result.success).toBe(false);
    expect(mockPostMessage).toHaveBeenCalled();
  });

  it('should clean up thinking message on error', async () => {
    mockFetch.mockResolvedValue(new Response('Bad Request', { status: 400 }));

    await streamAgentResponse(baseParams);

    expect(mockChatDelete).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'C456',
        ts: '1234.9999',
      })
    );
  });

  it('should stream successful response and clean up', async () => {
    const sseData =
      'data: {"type":"text-delta","delta":"Hello "}\n' +
      'data: {"type":"text-delta","delta":"world"}\n' +
      'data: [DONE]\n';

    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(sseData));
        controller.close();
      },
    });

    const localAppend = vi.fn().mockResolvedValue(undefined);
    const localStop = vi.fn().mockResolvedValue(undefined);
    mockSlackClient.chatStream.mockReturnValue({
      append: localAppend,
      stop: localStop,
    });

    mockFetch.mockResolvedValue(new Response(stream, { status: 200 }));

    const result = await streamAgentResponse(baseParams);

    expect(result.success).toBe(true);
    expect(localAppend).toHaveBeenCalled();
    expect(localStop).toHaveBeenCalled();
    expect(mockChatDelete).toHaveBeenCalledWith(expect.objectContaining({ ts: '1234.9999' }));
  });

  it('should pass conversationId in API request body', async () => {
    mockFetch.mockResolvedValue(new Response('Error', { status: 500 }));

    await streamAgentResponse(baseParams);

    const fetchCall = mockFetch.mock.calls[0];
    const body = JSON.parse(fetchCall[1]?.body as string);
    expect(body.conversationId).toBe('conv-123');
    expect(body.stream).toBe(true);
  });

  it('should surface API error message from response body instead of generic message', async () => {
    const errorBody = JSON.stringify({ message: 'Access denied: insufficient permissions' });
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response(errorBody, { status: 403 }));

    const result = await streamAgentResponse(baseParams);

    expect(result.success).toBe(false);
    expect(result.errorMessage).toBe('*Error.* Access denied: insufficient permissions');
    expect(mockPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        text: '*Error.* Access denied: insufficient permissions',
      })
    );
  });

  it('should fall back to classified error when response body has no message', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response('plain text error', { status: 403 }));

    const result = await streamAgentResponse(baseParams);

    expect(result.success).toBe(false);
    expect(result.errorMessage).toContain('Authentication error');
  });

  describe('contentAlreadyDelivered error suppression', () => {
    it('should return success and suppress error message when content was already streamed', async () => {
      // Simulate a stream that delivers content then throws on the next read
      const sseData = 'data: {"type":"text-delta","delta":"Hello world"}\n';
      let readCount = 0;
      const stream = new ReadableStream({
        pull(controller) {
          if (readCount === 0) {
            controller.enqueue(new TextEncoder().encode(sseData));
            readCount++;
          } else {
            controller.error(new Error('streamer.append timed out after 10000ms'));
          }
        },
      });

      const localAppend = vi.fn().mockResolvedValue(undefined);
      const localStop = vi.fn().mockResolvedValue(undefined);
      mockSlackClient.chatStream.mockReturnValue({
        append: localAppend,
        stop: localStop,
      });

      mockFetch.mockResolvedValue(new Response(stream, { status: 200 }));

      const result = await streamAgentResponse(baseParams);

      expect(result.success).toBe(true);
      // Should NOT post any error message to the user
      expect(mockPostMessage).not.toHaveBeenCalled();
      // Should still clean up thinking message
      expect(mockChatDelete).toHaveBeenCalledWith(
        expect.objectContaining({ channel: 'C456', ts: '1234.9999' })
      );
    });

    it('should post error message when no content was delivered', async () => {
      // Stream that errors immediately before any content
      const stream = new ReadableStream({
        pull(controller) {
          controller.error(new Error('connection reset'));
        },
      });

      const localAppend = vi.fn().mockResolvedValue(undefined);
      const localStop = vi.fn().mockResolvedValue(undefined);
      mockSlackClient.chatStream.mockReturnValue({
        append: localAppend,
        stop: localStop,
      });

      mockFetch.mockResolvedValue(new Response(stream, { status: 200 }));

      const result = await streamAgentResponse(baseParams);

      expect(result.success).toBe(false);
      expect(result.errorType).toBeDefined();
      // Should post error message since no content was delivered
      expect(mockPostMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: 'C456',
          thread_ts: '1234.5678',
        })
      );
    });

    it('should return success when streamer.stop() finalization times out after content delivery', async () => {
      const sseData =
        'data: {"type":"text-delta","delta":"Hello "}\n' +
        'data: {"type":"text-delta","delta":"world"}\n' +
        'data: [DONE]\n';

      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(sseData));
          controller.close();
        },
      });

      const localAppend = vi.fn().mockResolvedValue(undefined);
      // streamer.stop() rejects to simulate finalization timeout
      const localStop = vi
        .fn()
        .mockRejectedValue(new Error('streamer.stop timed out after 10000ms'));
      mockSlackClient.chatStream.mockReturnValue({
        append: localAppend,
        stop: localStop,
      });

      mockFetch.mockResolvedValue(new Response(stream, { status: 200 }));

      const result = await streamAgentResponse(baseParams);

      expect(result.success).toBe(true);
      // Should NOT post any error message to the user
      expect(mockPostMessage).not.toHaveBeenCalled();
      // Should still clean up thinking message
      expect(mockChatDelete).toHaveBeenCalledWith(expect.objectContaining({ ts: '1234.9999' }));
    });
  });
});
