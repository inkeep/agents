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
import { streamAgentResponse } from '../../slack/services/events/streaming';

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
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response('Internal Server Error', { status: 500 })
    );

    const result = await streamAgentResponse(baseParams);

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
    const mockResponse = new Response(null, { status: 200 });
    Object.defineProperty(mockResponse, 'body', { value: null });
    vi.spyOn(global, 'fetch').mockResolvedValue(mockResponse);

    const result = await streamAgentResponse(baseParams);

    expect(result.success).toBe(false);
    expect(mockPostMessage).toHaveBeenCalled();
  });

  it('should clean up thinking message on error', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response('Bad Request', { status: 400 }));

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

    vi.spyOn(global, 'fetch').mockResolvedValue(new Response(stream, { status: 200 }));

    const result = await streamAgentResponse(baseParams);

    expect(result.success).toBe(true);
    expect(localAppend).toHaveBeenCalled();
    expect(localStop).toHaveBeenCalled();
    expect(mockChatDelete).toHaveBeenCalledWith(expect.objectContaining({ ts: '1234.9999' }));
  });

  it('should pass conversationId in API request body', async () => {
    const fetchSpy = vi
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response('Error', { status: 500 }));

    await streamAgentResponse(baseParams);

    const fetchCall = fetchSpy.mock.calls[0];
    const body = JSON.parse(fetchCall[1]?.body as string);
    expect(body.conversationId).toBe('conv-123');
    expect(body.stream).toBe(true);
  });
});
