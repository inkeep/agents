import { createConversation, createMessage, upsertMessageFeedback } from '@inkeep/agents-core';
import { createTestProject } from '@inkeep/agents-core/db/test-manage-client';
import { describe, expect, it } from 'vitest';
import manageDbClient from '../../../data/db/manageDbClient';
import runDbClient from '../../../data/db/runDbClient';
import { makeRequest } from '../../utils/testRequest';
import { createTestTenantWithOrg } from '../../utils/testTenant';

const setupConversationWithFeedback = async (tenantSuffix: string) => {
  const tenantId = await createTestTenantWithOrg(tenantSuffix);
  const projectId = 'default-project';
  await createTestProject(manageDbClient, tenantId, projectId);

  const convId = `conv-${crypto.randomUUID()}`;
  await createConversation(runDbClient)({
    id: convId,
    tenantId,
    projectId,
    agentId: 'test-agent',
    activeSubAgentId: 'sub-agent-1',
    ref: { type: 'branch', name: 'main', hash: 'abc123' },
  });

  const msgId1 = `msg-${crypto.randomUUID()}`;
  const msgId2 = `msg-${crypto.randomUUID()}`;
  await createMessage(runDbClient)({
    scopes: { tenantId, projectId },
    data: {
      id: msgId1,
      conversationId: convId,
      role: 'agent',
      content: { text: 'First response' },
      visibility: 'user-facing',
      messageType: 'chat',
    },
  });
  await createMessage(runDbClient)({
    scopes: { tenantId, projectId },
    data: {
      id: msgId2,
      conversationId: convId,
      role: 'agent',
      content: { text: 'Second response' },
      visibility: 'user-facing',
      messageType: 'chat',
    },
  });

  return { tenantId, projectId, conversationId: convId, messageId1: msgId1, messageId2: msgId2 };
};

describe('Manage API - Conversation Feedback', () => {
  describe('GET /manage/tenants/:tenantId/projects/:projectId/conversations/:conversationId/feedback', () => {
    it('returns empty array when no feedback exists', async () => {
      const { tenantId, projectId, conversationId } =
        await setupConversationWithFeedback('fb-manage-empty');

      const res = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/conversations/${conversationId}/feedback`
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toEqual([]);
    });

    it('returns feedback entries for a conversation', async () => {
      const { tenantId, projectId, conversationId, messageId1, messageId2 } =
        await setupConversationWithFeedback('fb-manage-list');

      await upsertMessageFeedback(runDbClient)({
        scopes: { tenantId, projectId },
        data: {
          id: `fb-${crypto.randomUUID()}`,
          conversationId,
          messageId: messageId1,
          type: 'positive',
        },
      });
      await upsertMessageFeedback(runDbClient)({
        scopes: { tenantId, projectId },
        data: {
          id: `fb-${crypto.randomUUID()}`,
          conversationId,
          messageId: messageId2,
          type: 'negative',
          reasons: [{ label: 'Inaccurate', details: 'Wrong answer' }],
        },
      });

      const res = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/conversations/${conversationId}/feedback`
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toHaveLength(2);

      const positive = body.data.find((f: any) => f.messageId === messageId1);
      expect(positive.type).toBe('positive');
      expect(positive.reasons).toBeNull();
      expect(positive.createdAt).toBeDefined();
      expect(positive.updatedAt).toBeDefined();

      const negative = body.data.find((f: any) => f.messageId === messageId2);
      expect(negative.type).toBe('negative');
      expect(negative.reasons).toEqual([{ label: 'Inaccurate', details: 'Wrong answer' }]);
    });

    it('does not return feedback from other conversations', async () => {
      const { tenantId, projectId, conversationId, messageId1 } =
        await setupConversationWithFeedback('fb-manage-isolation');

      await upsertMessageFeedback(runDbClient)({
        scopes: { tenantId, projectId },
        data: {
          id: `fb-${crypto.randomUUID()}`,
          conversationId,
          messageId: messageId1,
          type: 'positive',
        },
      });

      const otherConvId = `conv-${crypto.randomUUID()}`;
      const res = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/conversations/${otherConvId}/feedback`
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toEqual([]);
    });
  });
});
