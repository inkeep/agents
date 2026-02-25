import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockStreamAgentResponse = vi.fn();

vi.mock('../../slack/services/events/streaming', () => ({
  streamAgentResponse: (...args: unknown[]) => mockStreamAgentResponse(...args),
}));

vi.mock('../../logger', () => ({
  getLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import { executeAgentPublicly } from '../../slack/services/events/execution';

const mockPostMessage = vi.fn().mockResolvedValue({ ok: true, ts: '1234.ack' });

const mockSlackClient = {
  chat: {
    postMessage: mockPostMessage,
    postEphemeral: vi.fn(),
    delete: vi.fn(),
    update: vi.fn(),
  },
  chatStream: vi.fn(),
  files: { uploadV2: vi.fn() },
} as any;

describe('executeAgentPublicly', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPostMessage.mockResolvedValue({ ok: true, ts: '1234.ack' });
    mockStreamAgentResponse.mockResolvedValue({ success: true });
  });

  it('should post thinking message and call streamAgentResponse with threadTs', async () => {
    await executeAgentPublicly({
      slackClient: mockSlackClient,
      channel: 'C123',
      threadTs: '1111.2222',
      slackUserId: 'U456',
      teamId: 'T789',
      jwtToken: 'jwt-token',
      projectId: 'proj-1',
      agentId: 'agent-1',
      agentName: 'Test Agent',
      question: 'Hello?',
      conversationId: 'conv-1',
    });

    expect(mockPostMessage).toHaveBeenCalledWith({
      channel: 'C123',
      thread_ts: '1111.2222',
      text: '_Test Agent is thinking..._',
    });

    expect(mockStreamAgentResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'C123',
        threadTs: '1111.2222',
        thinkingMessageTs: '1234.ack',
        question: 'Hello?',
        conversationId: 'conv-1',
      })
    );
  });

  it('should use thinking message ts as thread anchor when threadTs is undefined', async () => {
    await executeAgentPublicly({
      slackClient: mockSlackClient,
      channel: 'C123',
      slackUserId: 'U456',
      teamId: 'T789',
      jwtToken: 'jwt-token',
      projectId: 'proj-1',
      agentId: 'agent-1',
      agentName: 'Test Agent',
      question: 'Hello?',
      conversationId: 'conv-1',
    });

    expect(mockPostMessage).toHaveBeenCalledWith({
      channel: 'C123',
      text: '_Test Agent is thinking..._',
    });

    expect(mockStreamAgentResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'C123',
        threadTs: '1234.ack',
        thinkingMessageTs: '1234.ack',
      })
    );
  });

  it('should return the StreamResult from streamAgentResponse', async () => {
    mockStreamAgentResponse.mockResolvedValue({ success: false, errorType: 'timeout' });

    const result = await executeAgentPublicly({
      slackClient: mockSlackClient,
      channel: 'C123',
      slackUserId: 'U456',
      teamId: 'T789',
      jwtToken: 'jwt-token',
      projectId: 'proj-1',
      agentId: 'agent-1',
      agentName: 'Agent',
      question: 'test',
      conversationId: 'conv-1',
    });

    expect(result).toEqual({ success: false, errorType: 'timeout' });
  });

  it('should handle empty ack ts gracefully', async () => {
    mockPostMessage.mockResolvedValue({ ok: true });

    await executeAgentPublicly({
      slackClient: mockSlackClient,
      channel: 'C123',
      slackUserId: 'U456',
      teamId: 'T789',
      jwtToken: 'jwt-token',
      projectId: 'proj-1',
      agentId: 'agent-1',
      agentName: 'Agent',
      question: 'test',
      conversationId: 'conv-1',
    });

    expect(mockStreamAgentResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        thinkingMessageTs: '',
      })
    );
  });
});
