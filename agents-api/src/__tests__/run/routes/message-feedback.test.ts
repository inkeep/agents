import { createConversation, createMessage } from '@inkeep/agents-core';
import { describe, expect, it } from 'vitest';
import runDbClient from '../../../data/db/runDbClient';
import { makeRequest } from '../../utils/testRequest';

const TENANT_ID = 'test-tenant';
const PROJECT_ID = 'default';

const feedbackUrl = (conversationId: string, messageId: string) =>
  `/run/v1/conversations/${conversationId}/messages/${messageId}/feedback`;

const setupConversationWithMessage = async () => {
  const convId = `conv-${crypto.randomUUID()}`;
  await createConversation(runDbClient)({
    id: convId,
    tenantId: TENANT_ID,
    projectId: PROJECT_ID,
    agentId: 'test-agent',
    activeSubAgentId: 'sub-agent-1',
    ref: { type: 'branch', name: 'main', hash: 'abc123' },
  });

  const msgId = `msg-${crypto.randomUUID()}`;
  await createMessage(runDbClient)({
    scopes: { tenantId: TENANT_ID, projectId: PROJECT_ID },
    data: {
      id: msgId,
      conversationId: convId,
      role: 'agent',
      content: { text: 'Hello, how can I help?' },
      visibility: 'user-facing',
      messageType: 'chat',
    },
  });

  return { conversationId: convId, messageId: msgId };
};

describe('Run API - Message Feedback', () => {
  describe('POST /{conversationId}/messages/{messageId}/feedback', () => {
    it('submits positive feedback on a message', async () => {
      const { conversationId, messageId } = await setupConversationWithMessage();

      const res = await makeRequest(feedbackUrl(conversationId, messageId), {
        method: 'POST',
        body: JSON.stringify({ type: 'positive' }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.id).toBeDefined();
      expect(body.type).toBe('positive');
      expect(body.reasons).toBeNull();
      expect(body.createdAt).toBeDefined();
      expect(body.updatedAt).toBeDefined();
    });

    it('submits negative feedback with reasons', async () => {
      const { conversationId, messageId } = await setupConversationWithMessage();

      const reasons = [{ label: 'Inaccurate', details: 'The answer was wrong' }];
      const res = await makeRequest(feedbackUrl(conversationId, messageId), {
        method: 'POST',
        body: JSON.stringify({ type: 'negative', reasons }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.type).toBe('negative');
      expect(body.reasons).toEqual(reasons);
    });

    it('upserts feedback when submitted twice on the same message', async () => {
      const { conversationId, messageId } = await setupConversationWithMessage();

      const first = await makeRequest(feedbackUrl(conversationId, messageId), {
        method: 'POST',
        body: JSON.stringify({ type: 'negative' }),
      });
      expect(first.status).toBe(200);

      const second = await makeRequest(feedbackUrl(conversationId, messageId), {
        method: 'POST',
        body: JSON.stringify({ type: 'positive' }),
      });

      expect(second.status).toBe(200);
      const body = await second.json();
      expect(body.type).toBe('positive');
    });

    it('returns 400 for invalid feedback type', async () => {
      const { conversationId, messageId } = await setupConversationWithMessage();

      const res = await makeRequest(feedbackUrl(conversationId, messageId), {
        method: 'POST',
        body: JSON.stringify({ type: 'invalid' }),
      });

      expect(res.status).toBe(400);
    });

    it('returns 400 for missing type field', async () => {
      const { conversationId, messageId } = await setupConversationWithMessage();

      const res = await makeRequest(feedbackUrl(conversationId, messageId), {
        method: 'POST',
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
    });

    it('returns 404 for non-existent conversation', async () => {
      const res = await makeRequest(feedbackUrl('non-existent-conv', 'some-msg'), {
        method: 'POST',
        body: JSON.stringify({ type: 'positive' }),
      });

      expect(res.status).toBe(404);
    });

    it('returns 404 for non-existent message', async () => {
      const { conversationId } = await setupConversationWithMessage();

      const res = await makeRequest(feedbackUrl(conversationId, 'non-existent-msg'), {
        method: 'POST',
        body: JSON.stringify({ type: 'positive' }),
      });

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /{conversationId}/messages/{messageId}/feedback', () => {
    it('deletes existing feedback and returns 204', async () => {
      const { conversationId, messageId } = await setupConversationWithMessage();

      await makeRequest(feedbackUrl(conversationId, messageId), {
        method: 'POST',
        body: JSON.stringify({ type: 'positive' }),
      });

      const res = await makeRequest(feedbackUrl(conversationId, messageId), {
        method: 'DELETE',
      });

      expect(res.status).toBe(204);
    });

    it('returns 204 even when no feedback exists', async () => {
      const { conversationId, messageId } = await setupConversationWithMessage();

      const res = await makeRequest(feedbackUrl(conversationId, messageId), {
        method: 'DELETE',
      });

      expect(res.status).toBe(204);
    });

    it('returns 404 for non-existent conversation', async () => {
      const res = await makeRequest(feedbackUrl('non-existent-conv', 'some-msg'), {
        method: 'DELETE',
      });

      expect(res.status).toBe(404);
    });
  });
});
