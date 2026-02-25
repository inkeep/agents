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
const mockChatUpdate = vi.fn().mockResolvedValue({ ok: true });
const mockStreamAppend = vi.fn().mockResolvedValue(undefined);
const mockStreamStop = vi.fn().mockResolvedValue(undefined);

const mockSlackClient = {
  chat: {
    postMessage: mockPostMessage,
    postEphemeral: mockPostEphemeral,
    delete: mockChatDelete,
    update: mockChatUpdate,
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
    mockPostMessage.mockResolvedValue({ ok: true });
    mockPostEphemeral.mockResolvedValue({ ok: true });
    mockChatDelete.mockResolvedValue({ ok: true });
    mockChatUpdate.mockResolvedValue({ ok: true });
    mockStreamAppend.mockResolvedValue(undefined);
    mockStreamStop.mockResolvedValue(undefined);
    mockSlackClient.chatStream.mockReturnValue({
      append: mockStreamAppend,
      stop: mockStreamStop,
    });
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

  describe('tool-approval-request event handling', () => {
    it('should post an approval message when tool-approval-request event is received', async () => {
      const sseData =
        'data: {"type":"tool-input-available","toolCallId":"tc-1","toolName":"search_web","input":{"query":"hello"}}\n' +
        'data: {"type":"tool-approval-request","toolCallId":"tc-1","approvalId":"aitxt-tc-1"}\n' +
        'data: {"type":"data-operation","data":{"type":"completion"}}\n';

      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(sseData));
          controller.close();
        },
      });

      mockFetch.mockResolvedValue(new Response(stream, { status: 200 }));

      await streamAgentResponse(baseParams);

      expect(mockPostMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: 'C456',
          thread_ts: '1234.5678',
          text: expect.stringContaining('search_web'),
          blocks: expect.arrayContaining([expect.objectContaining({ type: 'section' })]),
        })
      );
    });

    it('should default toolName to "Tool" when toolName is absent from event', async () => {
      const sseData =
        'data: {"type":"tool-approval-request","toolCallId":"tc-2"}\n' +
        'data: {"type":"data-operation","data":{"type":"completion"}}\n';

      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(sseData));
          controller.close();
        },
      });

      mockFetch.mockResolvedValue(new Response(stream, { status: 200 }));

      await streamAgentResponse(baseParams);

      expect(mockPostMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('Tool'),
        })
      );
    });

    it('should embed conversationId and toolCallId in the button value', async () => {
      const sseData =
        'data: {"type":"tool-input-available","toolCallId":"tc-3","toolName":"run_code","input":{}}\n' +
        'data: {"type":"tool-approval-request","toolCallId":"tc-3","approvalId":"aitxt-tc-3"}\n' +
        'data: {"type":"data-operation","data":{"type":"completion"}}\n';

      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(sseData));
          controller.close();
        },
      });

      mockFetch.mockResolvedValue(new Response(stream, { status: 200 }));

      await streamAgentResponse(baseParams);

      const call = mockPostMessage.mock.calls[0][0];
      const actionsBlock = call.blocks.find((b: any) => b.type === 'actions');
      const buttonValue = JSON.parse(actionsBlock.elements[0].value);
      expect(buttonValue.toolCallId).toBe('tc-3');
      expect(buttonValue.conversationId).toBe('conv-123');
      expect(buttonValue.toolName).toBe('run_code');
    });

    it('should not post approval message when conversationId is absent', async () => {
      const sseData =
        'data: {"type":"tool-approval-request","toolCallId":"tc-4","toolName":"search_web"}\n' +
        'data: {"type":"data-operation","data":{"type":"completion"}}\n';

      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(sseData));
          controller.close();
        },
      });

      mockFetch.mockResolvedValue(new Response(stream, { status: 200 }));

      await streamAgentResponse({ ...baseParams, conversationId: '' });

      expect(mockPostMessage).not.toHaveBeenCalled();
    });

    it('should update approval message to expired when stream errors after posting it', async () => {
      const approvalTs = '9999.1111';
      mockPostMessage.mockResolvedValue({ ok: true, ts: approvalTs });

      const localAppend = vi.fn().mockResolvedValue(undefined);
      const localStop = vi.fn().mockResolvedValue(undefined);
      mockSlackClient.chatStream.mockReturnValue({ append: localAppend, stop: localStop });

      const sseData =
        'data: {"type":"tool-input-available","toolCallId":"tc-5","toolName":"run_code","input":{}}\n' +
        'data: {"type":"tool-approval-request","toolCallId":"tc-5","approvalId":"aitxt-tc-5"}\n';

      let readCount = 0;
      const stream = new ReadableStream({
        pull(controller) {
          if (readCount === 0) {
            controller.enqueue(new TextEncoder().encode(sseData));
            readCount++;
          } else {
            controller.error(new Error('stream closed'));
          }
        },
      });

      mockFetch.mockResolvedValue(new Response(stream, { status: 200 }));

      await streamAgentResponse(baseParams);

      expect(mockChatUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: 'C456',
          ts: approvalTs,
          text: expect.stringContaining('Expired'),
          blocks: expect.arrayContaining([expect.objectContaining({ type: 'context' })]),
        })
      );
      expect(mockPostMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: 'C456',
          thread_ts: '1234.5678',
          text: expect.stringContaining('run_code'),
        })
      );
    });

    it('should not call chat.update when no approval message was posted', async () => {
      const localAppend = vi.fn().mockResolvedValue(undefined);
      const localStop = vi.fn().mockResolvedValue(undefined);
      mockSlackClient.chatStream.mockReturnValue({ append: localAppend, stop: localStop });

      const stream = new ReadableStream({
        pull(controller) {
          controller.error(new Error('immediate error'));
        },
      });

      mockFetch.mockResolvedValue(new Response(stream, { status: 200 }));

      await streamAgentResponse(baseParams);

      expect(mockChatUpdate).not.toHaveBeenCalled();
    });
    it('should surface API error message from response body instead of generic message', async () => {
      const errorBody = JSON.stringify({ message: 'Access denied: insufficient permissions' });
      mockFetch.mockResolvedValue(new Response(errorBody, { status: 403 }));

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
      mockFetch.mockResolvedValue(new Response('plain text error', { status: 403 }));

      const result = await streamAgentResponse(baseParams);

      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain('Authentication error');
    });

    describe('thinking message cleanup as thread anchor', () => {
      it('should update thinking message with question when it is the thread anchor', async () => {
        const sseData = 'data: {"type":"text-delta","delta":"Hello"}\n' + 'data: [DONE]\n';

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

        // thinkingMessageTs === threadTs means the thinking message IS the thread anchor
        await streamAgentResponse({
          ...baseParams,
          threadTs: '1234.9999',
          thinkingMessageTs: '1234.9999',
          question: 'What is Inkeep?',
        });

        expect(mockChatUpdate).toHaveBeenCalledWith(
          expect.objectContaining({
            channel: 'C456',
            ts: '1234.9999',
            text: '<@U123> to Test Agent: "What is Inkeep?"',
          })
        );
        expect(mockChatDelete).not.toHaveBeenCalledWith(
          expect.objectContaining({ ts: '1234.9999' })
        );
      });

      it('should update thinking message with invocation attribution when question is empty', async () => {
        const sseData = 'data: {"type":"text-delta","delta":"Hello"}\n' + 'data: [DONE]\n';

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

        await streamAgentResponse({
          ...baseParams,
          threadTs: '1234.9999',
          thinkingMessageTs: '1234.9999',
          question: '',
        });

        expect(mockChatUpdate).toHaveBeenCalledWith(
          expect.objectContaining({
            channel: 'C456',
            ts: '1234.9999',
            text: '<@U123> invoked _Test Agent_',
          })
        );
        expect(mockChatDelete).not.toHaveBeenCalledWith(
          expect.objectContaining({ ts: '1234.9999' })
        );
      });

      it('should delete thinking message when it is NOT the thread anchor', async () => {
        mockFetch.mockResolvedValue(new Response('Error', { status: 500 }));

        await streamAgentResponse({
          ...baseParams,
          threadTs: '1111.2222',
          thinkingMessageTs: '3333.4444',
        });

        expect(mockChatDelete).toHaveBeenCalledWith(expect.objectContaining({ ts: '3333.4444' }));
        expect(mockChatUpdate).not.toHaveBeenCalledWith(
          expect.objectContaining({ ts: '3333.4444' })
        );
      });
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
});
