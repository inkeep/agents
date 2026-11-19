import {
  createConversation,
  createMessage,
  getMessagesByConversation,
  SPAN_KEYS,
} from '@inkeep/agents-core';
import { SpanStatusCode } from '@opentelemetry/api';
import { generateText } from 'ai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import runDbClient from '../../../data/db/runDbClient';
import { ConversationCompressor } from '../../../domains/run/compression/ConversationCompressor';
import {
  compressConversationIfNeeded,
  createDefaultConversationHistoryConfig,
  getConversationHistoryWithCompression,
  reconstructMessageText,
} from '../../../domains/run/data/conversations';
import { type AgentSession, agentSessionManager } from '../../../domains/run/session/AgentSession';
import type { ConversationHistorySummary } from '../../../domains/run/tools/distill-conversation-history-tool';
import { tracer } from '../../../domains/run/utils/tracer';

vi.mock('ai', async (importOriginal) => ({
  ...(await importOriginal<typeof import('ai')>()),
  generateText: vi.fn(),
}));

const scopes = { tenantId: 'compression-test', projectId: 'test-project' };
const summarizerModel = { model: 'openai/gpt-4o-mini' };

async function createHistory() {
  const conversationId = crypto.randomUUID();
  await createConversation(runDbClient)({
    id: conversationId,
    ...scopes,
    agentId: 'test-agent',
    activeSubAgentId: 'test-sub-agent',
    ref: { type: 'branch', name: 'main', hash: 'abc123' },
  });
  const messages = [
    await createMessage(runDbClient)({
      scopes,
      data: {
        id: crypto.randomUUID(),
        conversationId,
        role: 'user',
        content: { text: 'Keep invoice A-1001.' },
        visibility: 'user-facing',
        messageType: 'chat',
      },
    }),
  ];

  return { conversationId, messages };
}

function listPersistedMessages(conversationId: string) {
  return getMessagesByConversation(runDbClient)({ scopes, conversationId, pagination: {} });
}

const validSummary = {
  type: 'conversation_history_summary_v1',
  session_id: null,
  _fallback: null,
  conversation_overview: 'The user asked to keep invoice A-1001.',
  user_goals: { primary: 'Keep the invoice', secondary: [] },
  key_outcomes: { completed: [], partial: [], discoveries: [] },
  technical_context: {
    technologies: [],
    configurations: [],
    issues_encountered: [],
    solutions_applied: [],
  },
  conversation_artifacts: [],
  conversation_flow: { major_phases: [], decision_points: [], topic_shifts: [] },
  context_for_continuation: { current_state: '', next_logical_steps: [], important_context: [] },
} satisfies ConversationHistorySummary;

describe('conversation history compression', () => {
  beforeEach(() => {
    vi.mocked(generateText).mockReset();
    vi.spyOn(ConversationCompressor.prototype, 'isCompressionNeeded').mockReturnValue(true);
    vi.spyOn(ConversationCompressor.prototype, 'saveToolResultsAsArtifacts').mockResolvedValue({});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps stored history available after the summarizer rejects and can retry', async () => {
    const { conversationId, messages } = await createHistory();
    const params = { ...scopes, conversationId, summarizerModel };
    const span = { setAttributes: vi.fn(), setStatus: vi.fn(), end: vi.fn() };
    vi.spyOn(tracer, 'startActiveSpan').mockImplementation((...args: unknown[]) => {
      const run = args.at(-1) as (activeSpan: typeof span) => unknown;
      return run(span);
    });
    vi.mocked(generateText).mockRejectedValueOnce(new Error('529 Overloaded'));

    expect(await compressConversationIfNeeded(messages, params)).toEqual(messages);
    expect(generateText).toHaveBeenCalledTimes(1);
    expect(await listPersistedMessages(conversationId)).toEqual(messages);
    expect(span.setAttributes).toHaveBeenCalledWith(
      expect.objectContaining({ [SPAN_KEYS.COMPRESSION_ERROR]: '529 Overloaded' })
    );
    expect(span.setAttributes).toHaveBeenCalledWith(
      expect.objectContaining({ [SPAN_KEYS.COMPRESSION_SUCCESS]: false })
    );
    expect(span.setStatus).toHaveBeenLastCalledWith({ code: SpanStatusCode.ERROR });
    expect(await getConversationHistoryWithCompression({ ...scopes, conversationId })).toEqual(
      messages
    );

    vi.mocked(generateText).mockResolvedValueOnce({
      output: validSummary,
    } as Awaited<ReturnType<typeof generateText>>);
    const result = await compressConversationIfNeeded(messages, params);
    expect(generateText).toHaveBeenCalledTimes(2);
    expect(span.setStatus).toHaveBeenLastCalledWith({ code: SpanStatusCode.OK });
    expect(result).toEqual([
      expect.objectContaining({
        messageType: 'compression_summary',
        content: { text: expect.stringContaining('A-1001') },
      }),
    ]);
    expect(await listPersistedMessages(conversationId)).toEqual(
      expect.arrayContaining([messages[0], result[0]])
    );
  });

  it('returns the message fallback without persisting it as a summary', async () => {
    const { conversationId, messages } = await createHistory();
    vi.spyOn(ConversationCompressor.prototype, 'saveToolResultsAsArtifacts').mockRejectedValueOnce(
      new Error('Session ended before artifact collection')
    );

    const result = await compressConversationIfNeeded(messages, {
      ...scopes,
      conversationId,
      summarizerModel,
    });
    expect(result).toEqual(messages);
    expect(generateText).not.toHaveBeenCalled();
    expect(await listPersistedMessages(conversationId)).toEqual(messages);
  });

  it('keeps a tool result renderable when artifact collection precedes a failed summary', async () => {
    const { conversationId, messages } = await createHistory();
    vi.mocked(ConversationCompressor.prototype.saveToolResultsAsArtifacts).mockRestore();
    vi.spyOn(agentSessionManager, 'getSession').mockReturnValue({
      recordEvent: vi.fn(),
      waitForPendingArtifacts: vi.fn().mockResolvedValue(undefined),
    } as unknown as AgentSession);
    const toolResult = await createMessage(runDbClient)({
      scopes,
      data: {
        id: crypto.randomUUID(),
        conversationId,
        role: 'assistant',
        content: { text: 'Invoice total: 320' },
        visibility: 'internal',
        messageType: 'tool-result',
        metadata: { a2a_metadata: { toolCallId: 'invoice-call', toolName: 'lookup_invoice' } },
      },
    });
    vi.mocked(generateText).mockRejectedValueOnce(new Error('529 Overloaded'));

    const fallback = await compressConversationIfNeeded([...messages, toolResult], {
      ...scopes,
      conversationId,
      summarizerModel,
    });
    expect(generateText).toHaveBeenCalledTimes(1);
    expect(fallback.map(reconstructMessageText)).toContain('Invoice total: 320');
  });

  it('discards a provider response explicitly marked as a fallback', async () => {
    const { conversationId, messages } = await createHistory();
    vi.mocked(generateText).mockResolvedValueOnce({
      output: { ...validSummary, _fallback: true },
    } as Awaited<ReturnType<typeof generateText>>);

    expect(
      await compressConversationIfNeeded(messages, { ...scopes, conversationId, summarizerModel })
    ).toEqual(messages);
    expect(generateText).toHaveBeenCalledTimes(1);
    expect(await listPersistedMessages(conversationId)).toEqual(messages);
  });

  it.each([
    { label: 'placeholder object', summaryData: { _fallback: true } },
    { label: 'message array', summaryData: [] },
  ])('ignores a previously persisted $label', async ({ summaryData }) => {
    const { conversationId, messages } = await createHistory();
    await createMessage(runDbClient)({
      scopes,
      data: {
        id: crypto.randomUUID(),
        conversationId,
        role: 'system',
        content: { text: 'Invalid compression summary' },
        visibility: 'internal',
        messageType: 'compression_summary',
        metadata: { a2a_metadata: { compressionType: 'conversation_history', summaryData } },
      },
    });

    const history = await getConversationHistoryWithCompression({
      ...scopes,
      conversationId,
      options: {
        ...createDefaultConversationHistoryConfig(),
        messageTypes: [],
      },
    });
    expect(history).toEqual(messages);
  });
});
