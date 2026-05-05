import type { ConversationSelect, FeedbackSelect, MessageSelect } from '@inkeep/agents-core';
import { describe, expect, it } from 'vitest';
import {
  CONVERSATION_DETAIL_MESSAGE_LIMIT,
  formatConversationDetail,
  formatFeedback,
  formatMessage,
  toIsoString,
} from '../conversationFormatter';

const conversationFixture = (overrides: Partial<ConversationSelect> = {}): ConversationSelect =>
  ({
    id: 'conv-1',
    tenantId: 't',
    projectId: 'p',
    userId: 'user-1',
    agentId: 'agent-1',
    activeSubAgentId: 'sub-1',
    ref: null,
    title: null,
    lastContextResolution: null,
    metadata: null,
    createdAt: '2026-05-05T10:00:00.000Z',
    updatedAt: '2026-05-05T10:00:01.000Z',
    ...overrides,
  }) as ConversationSelect;

const messageFixture = (overrides: Partial<MessageSelect> = {}): MessageSelect =>
  ({
    id: 'msg-1',
    tenantId: 't',
    projectId: 'p',
    conversationId: 'conv-1',
    role: 'user',
    fromSubAgentId: null,
    toSubAgentId: null,
    fromExternalAgentId: null,
    toExternalAgentId: null,
    fromTeamAgentId: null,
    toTeamAgentId: null,
    content: { text: 'hello' },
    visibility: 'user-facing',
    messageType: 'chat',
    taskId: null,
    parentMessageId: null,
    a2aTaskId: null,
    a2aSessionId: null,
    metadata: null,
    createdAt: '2026-05-05T10:00:00.500Z',
    updatedAt: '2026-05-05T10:00:00.500Z',
    ...overrides,
  }) as MessageSelect;

describe('toIsoString', () => {
  it('returns epoch for null/undefined/empty', () => {
    expect(toIsoString(null)).toBe('1970-01-01T00:00:00.000Z');
    expect(toIsoString(undefined)).toBe('1970-01-01T00:00:00.000Z');
    expect(toIsoString('')).toBe('1970-01-01T00:00:00.000Z');
  });

  it('passes ISO 8601 strings with Z through unchanged', () => {
    expect(toIsoString('2026-05-05T15:58:45.955Z')).toBe('2026-05-05T15:58:45.955Z');
  });

  it('parses naive Postgres timestamps as UTC, not local time', () => {
    // The bug we fixed: naive strings were being interpreted as local time, shifting by the
    // process timezone offset. Now they get a 'Z' appended and stay UTC.
    expect(toIsoString('2026-05-05 15:58:45.955')).toBe('2026-05-05T15:58:45.955Z');
  });

  it('preserves explicit timezone offsets', () => {
    expect(toIsoString('2026-05-05T15:58:45.955+02:00')).toBe('2026-05-05T13:58:45.955Z');
  });

  it('handles Date objects', () => {
    const d = new Date('2026-05-05T10:00:00.000Z');
    expect(toIsoString(d)).toBe('2026-05-05T10:00:00.000Z');
  });

  it('returns epoch for unparseable strings', () => {
    expect(toIsoString('not a date')).toBe('1970-01-01T00:00:00.000Z');
  });
});

describe('formatMessage', () => {
  it('normalizes role agent → assistant', () => {
    expect(formatMessage(messageFixture({ role: 'agent' })).role).toBe('assistant');
  });

  it('keeps role user as user', () => {
    expect(formatMessage(messageFixture({ role: 'user' })).role).toBe('user');
  });

  it('flattens content.text to a string', () => {
    expect(formatMessage(messageFixture({ content: { text: 'hi there' } })).content).toBe(
      'hi there'
    );
  });

  it('returns null when content has no text field', () => {
    expect(formatMessage(messageFixture({ content: { parts: [] } as any })).content).toBeNull();
  });

  it('returns null when content is null', () => {
    expect(formatMessage(messageFixture({ content: null as any })).content).toBeNull();
  });

  it('drops content.parts (streaming chunks) on the wire', () => {
    const result = formatMessage(
      messageFixture({
        content: { text: 'full', parts: [{ kind: 'text', text: 'fu' }] } as any,
      })
    );
    expect(result).not.toHaveProperty('parts');
    expect(result.content).toBe('full');
  });

  it('drops internal columns (tenantId, projectId, fromSubAgentId, taskId, a2aTaskId)', () => {
    const result = formatMessage(messageFixture());
    expect(Object.keys(result).sort()).toEqual(['content', 'createdAt', 'id', 'role']);
  });

  it('normalizes naive timestamp to ISO 8601 with Z', () => {
    expect(formatMessage(messageFixture({ createdAt: '2026-05-05 12:00:00.000' })).createdAt).toBe(
      '2026-05-05T12:00:00.000Z'
    );
  });
});

describe('formatConversationDetail', () => {
  it('builds the canonical shape from a conversation row + messages', () => {
    const conversation = conversationFixture({
      title: 'Test conv',
      metadata: { userContext: { email: 'u@x.com', plan: 'pro' } } as any,
    });
    const messages = [messageFixture({ id: 'm1', role: 'user', content: { text: 'hi' } })];
    const result = formatConversationDetail(conversation, messages);

    expect(result).toEqual({
      id: 'conv-1',
      agentId: 'agent-1',
      title: 'Test conv',
      userProperties: { email: 'u@x.com', plan: 'pro' },
      properties: null,
      createdAt: '2026-05-05T10:00:00.000Z',
      updatedAt: '2026-05-05T10:00:01.000Z',
      messages: [{ id: 'm1', role: 'user', content: 'hi', createdAt: '2026-05-05T10:00:00.500Z' }],
    });
  });

  it('extracts userProperties from metadata.userContext', () => {
    const conversation = conversationFixture({
      metadata: { userContext: { email: 'u@x.com' } } as any,
    });
    expect(formatConversationDetail(conversation, []).userProperties).toEqual({
      email: 'u@x.com',
    });
  });

  it('returns null userProperties when metadata is null', () => {
    const conversation = conversationFixture({ metadata: null });
    expect(formatConversationDetail(conversation, []).userProperties).toBeNull();
  });

  it('returns null userProperties when metadata exists but userContext is missing', () => {
    const conversation = conversationFixture({
      metadata: { preferences: { lang: 'en' } } as any,
    });
    expect(formatConversationDetail(conversation, []).userProperties).toBeNull();
  });

  it('always sets properties to null (no source today)', () => {
    expect(formatConversationDetail(conversationFixture(), []).properties).toBeNull();
  });

  it('does not leak internal metadata fields (apiKeyId, verifiedClaims, initiatedBy) on the wire', () => {
    const conversation = conversationFixture({
      metadata: {
        userContext: { email: 'u@x.com' },
        apiKeyId: 'leaky',
        verifiedClaims: { sub: 'user-123' },
        initiatedBy: { type: 'user', id: 'user-123' },
        preferences: { lang: 'en' },
      } as any,
    });
    const result = formatConversationDetail(conversation, []);
    const stringified = JSON.stringify(result);
    expect(stringified).not.toContain('apiKeyId');
    expect(stringified).not.toContain('verifiedClaims');
    expect(stringified).not.toContain('initiatedBy');
    expect(stringified).not.toContain('preferences');
  });

  it('caps messages at CONVERSATION_DETAIL_MESSAGE_LIMIT, keeping the most recent', () => {
    const messages = Array.from({ length: CONVERSATION_DETAIL_MESSAGE_LIMIT + 50 }, (_, i) =>
      messageFixture({ id: `msg-${i}`, content: { text: `${i}` } })
    );
    const result = formatConversationDetail(conversationFixture(), messages);
    expect(result.messages).toHaveLength(CONVERSATION_DETAIL_MESSAGE_LIMIT);
    expect(result.messages[0].id).toBe('msg-50');
    expect(result.messages.at(-1)?.id).toBe(`msg-${CONVERSATION_DETAIL_MESSAGE_LIMIT + 49}`);
  });

  it('handles a null agentId', () => {
    expect(formatConversationDetail(conversationFixture({ agentId: null }), []).agentId).toBeNull();
  });
});

describe('formatFeedback', () => {
  const feedbackFixture = (overrides: Partial<FeedbackSelect> = {}): FeedbackSelect =>
    ({
      id: 'fb-1',
      tenantId: 't',
      projectId: 'p',
      conversationId: 'conv-1',
      messageId: 'msg-1',
      type: 'positive',
      details: 'Good answer',
      createdAt: '2026-05-05T11:00:00.000Z',
      updatedAt: '2026-05-05T11:00:00.000Z',
      ...overrides,
    }) as FeedbackSelect;

  it('strips tenantId and projectId from the wire shape', () => {
    const result = formatFeedback(feedbackFixture());
    expect(result).not.toHaveProperty('tenantId');
    expect(result).not.toHaveProperty('projectId');
  });

  it('keeps id (not feedbackId), type, details, messageId, conversationId, createdAt, updatedAt', () => {
    const result = formatFeedback(feedbackFixture());
    expect(result).toMatchObject({
      id: 'fb-1',
      conversationId: 'conv-1',
      messageId: 'msg-1',
      type: 'positive',
      details: 'Good answer',
      createdAt: '2026-05-05T11:00:00.000Z',
      updatedAt: '2026-05-05T11:00:00.000Z',
    });
    expect(result).not.toHaveProperty('feedbackId');
  });

  it('normalizes naive timestamps on createdAt and updatedAt', () => {
    const result = formatFeedback(
      feedbackFixture({
        createdAt: '2026-05-05 11:00:00.000' as any,
        updatedAt: '2026-05-05 11:00:30.000' as any,
      })
    );
    expect(result.createdAt).toBe('2026-05-05T11:00:00.000Z');
    expect(result.updatedAt).toBe('2026-05-05T11:00:30.000Z');
  });
});
