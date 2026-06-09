import type { AgentsRunDatabaseClient } from '@inkeep/agents-core/db/runtime/runtime-client';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  createConversation,
  extractMessageText,
  getConversationsByIds,
} from '../../../data-access/runtime/conversations';
import {
  createMessage,
  getFirstUserMessageByConversations,
  getLastAssistantMessageByConversations,
} from '../../../data-access/runtime/messages';
import type { ConversationInsert } from '../../../types/index';
import { testRunDbClient } from '../../setup';

/**
 * Set-based enrichment queries that back the evaluation-results endpoints. They replaced an
 * unbounded per-conversation fan-out that exhausted the runtime DB connection pool, so these
 * tests exercise the real SQL (Postgres DISTINCT ON, inArray) against pglite.
 */
describe('Eval result enrichment data access - Integration Tests', () => {
  let db: AgentsRunDatabaseClient;
  const tenantId = 'test-tenant';
  const projectId = 'test-project';

  const conversationData = (suffix: string, agentId: string): ConversationInsert => ({
    id: `conv-${suffix}`,
    tenantId,
    projectId,
    agentId,
    userId: `user-${suffix}`,
    activeSubAgentId: `sub-agent-${suffix}`,
    ref: { type: 'branch', name: 'main', hash: 'abc123' },
  });

  const seedMessage = (
    id: string,
    conversationId: string,
    role: string,
    text: string,
    createdAt: string
  ) =>
    createMessage(db)({
      scopes: { tenantId, projectId },
      data: {
        id,
        conversationId,
        role,
        content: { text },
        visibility: 'user-facing',
        messageType: 'chat',
        createdAt,
        updatedAt: createdAt,
      } as any,
    });

  beforeEach(async () => {
    db = testRunDbClient;
  });

  describe('getConversationsByIds', () => {
    it('batch-fetches id, agentId, and createdAt for the requested conversations only', async () => {
      await createConversation(db)(conversationData('a', 'agent-a'));
      await createConversation(db)(conversationData('b', 'agent-b'));
      await createConversation(db)(conversationData('c', 'agent-c'));

      const rows = await getConversationsByIds(db)({
        scopes: { tenantId, projectId },
        conversationIds: ['conv-a', 'conv-b'],
      });

      expect(rows).toHaveLength(2);
      const byId = new Map(rows.map((r) => [r.id, r]));
      expect(byId.get('conv-a')?.agentId).toBe('agent-a');
      expect(byId.get('conv-b')?.agentId).toBe('agent-b');
      expect(byId.get('conv-a')?.createdAt).toBeDefined();
      expect(byId.has('conv-c')).toBe(false);
    });

    it('returns an empty array for an empty id list without querying', async () => {
      const rows = await getConversationsByIds(db)({
        scopes: { tenantId, projectId },
        conversationIds: [],
      });
      expect(rows).toEqual([]);
    });
  });

  describe('getFirstUserMessageByConversations', () => {
    it('returns the earliest user message per conversation, one row each', async () => {
      await createConversation(db)(conversationData('x', 'agent-x'));
      await createConversation(db)(conversationData('y', 'agent-y'));

      // conv-x: an agent message precedes two user messages; the earliest user message wins.
      await seedMessage('x-1', 'conv-x', 'agent', 'agent greeting', '2026-01-01T00:00:00.000Z');
      await seedMessage('x-2', 'conv-x', 'user', 'first user question', '2026-01-01T00:00:01.000Z');
      await seedMessage('x-3', 'conv-x', 'user', 'later user question', '2026-01-01T00:00:02.000Z');
      // conv-y: single user message.
      await seedMessage('y-1', 'conv-y', 'user', 'only question', '2026-01-01T00:00:00.000Z');

      const rows = await getFirstUserMessageByConversations(db)({
        scopes: { tenantId, projectId },
        conversationIds: ['conv-x', 'conv-y'],
      });

      expect(rows).toHaveLength(2);
      const byConversation = new Map(rows.map((r) => [r.conversationId, r]));
      expect(byConversation.get('conv-x')?.content?.text).toBe('first user question');
      expect(byConversation.get('conv-y')?.content?.text).toBe('only question');
    });

    it('omits conversations with no user message', async () => {
      await createConversation(db)(conversationData('z', 'agent-z'));
      await seedMessage('z-1', 'conv-z', 'agent', 'agent only', '2026-01-01T00:00:00.000Z');

      const rows = await getFirstUserMessageByConversations(db)({
        scopes: { tenantId, projectId },
        conversationIds: ['conv-z'],
      });

      expect(rows).toEqual([]);
    });

    it('returns an empty array for an empty id list without querying', async () => {
      const rows = await getFirstUserMessageByConversations(db)({
        scopes: { tenantId, projectId },
        conversationIds: [],
      });
      expect(rows).toEqual([]);
    });

    it('extracts text from A2A parts-format content (not just top-level text)', async () => {
      await createConversation(db)(conversationData('p', 'agent-p'));
      await createMessage(db)({
        scopes: { tenantId, projectId },
        data: {
          id: 'p-1',
          conversationId: 'conv-p',
          role: 'user',
          content: { parts: [{ kind: 'text', text: 'question via parts' }] },
          visibility: 'user-facing',
          messageType: 'chat',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        } as any,
      });

      const rows = await getFirstUserMessageByConversations(db)({
        scopes: { tenantId, projectId },
        conversationIds: ['conv-p'],
      });

      expect(rows).toHaveLength(1);
      expect(extractMessageText(rows[0]?.content ?? {})).toBe('question via parts');
    });
  });

  describe('getLastAssistantMessageByConversations', () => {
    it('returns the most recent assistant/agent message per conversation', async () => {
      await createConversation(db)(conversationData('m', 'agent-m'));
      await createConversation(db)(conversationData('n', 'agent-n'));

      // conv-m: user message then two agent responses; the latest agent response wins.
      await seedMessage('m-1', 'conv-m', 'user', 'the question', '2026-01-01T00:00:00.000Z');
      await seedMessage('m-2', 'conv-m', 'agent', 'first answer', '2026-01-01T00:00:01.000Z');
      await seedMessage('m-3', 'conv-m', 'assistant', 'final answer', '2026-01-01T00:00:02.000Z');
      // conv-n: only a user message — no assistant/agent output.
      await seedMessage('n-1', 'conv-n', 'user', 'unanswered', '2026-01-01T00:00:00.000Z');

      const rows = await getLastAssistantMessageByConversations(db)({
        scopes: { tenantId, projectId },
        conversationIds: ['conv-m', 'conv-n'],
      });

      expect(rows).toHaveLength(1);
      expect(rows[0]?.conversationId).toBe('conv-m');
      expect(rows[0]?.content?.text).toBe('final answer');
    });

    it('returns an empty array for an empty id list without querying', async () => {
      const rows = await getLastAssistantMessageByConversations(db)({
        scopes: { tenantId, projectId },
        conversationIds: [],
      });
      expect(rows).toEqual([]);
    });
  });
});
