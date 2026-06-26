import { addLedgerArtifacts, createConversation, createMessage } from '@inkeep/agents-core';
import { createTestProject } from '@inkeep/agents-core/db/test-manage-client';
import { describe, expect, it } from 'vitest';
import manageDbClient from '../../../../data/db/manageDbClient';
import runDbClient from '../../../../data/db/runDbClient';
import { makeRequest } from '../../../utils/testRequest';
import { createTestTenantWithOrg } from '../../../utils/testTenant';

const createTestConversation = async ({
  tenantId,
  projectId,
  userId,
  title,
  agentId = 'test-agent',
}: {
  tenantId: string;
  projectId: string;
  userId?: string;
  title?: string;
  agentId?: string;
}) => {
  const id = `conv-${crypto.randomUUID()}`;
  return createConversation(runDbClient)({
    id,
    tenantId,
    projectId,
    userId,
    agentId,
    title,
    activeSubAgentId: 'sub-agent-1',
    ref: { type: 'branch', name: 'main', hash: 'abc123' },
  });
};

describe('Manage API - Conversation List', () => {
  describe('GET /manage/tenants/:tenantId/projects/:projectId/conversations', () => {
    it('should list all conversations in a project', async () => {
      const tenantId = await createTestTenantWithOrg('manage-conv-list');
      const projectId = 'default-project';
      await createTestProject(manageDbClient, tenantId, projectId);

      await createTestConversation({ tenantId, projectId, title: 'Conv 1', userId: 'user-1' });
      await createTestConversation({ tenantId, projectId, title: 'Conv 2', userId: 'user-2' });
      await createTestConversation({ tenantId, projectId, title: 'Conv 3' });

      const res = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/conversations`
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.conversations).toHaveLength(3);
      expect(body.data.pagination.total).toBe(3);
    });

    it('should filter by userId when provided', async () => {
      const tenantId = await createTestTenantWithOrg('manage-conv-filter');
      const projectId = 'default-project';
      await createTestProject(manageDbClient, tenantId, projectId);

      await createTestConversation({
        tenantId,
        projectId,
        title: 'User 1 conv',
        userId: 'user-1',
      });
      await createTestConversation({
        tenantId,
        projectId,
        title: 'User 2 conv',
        userId: 'user-2',
      });
      await createTestConversation({
        tenantId,
        projectId,
        title: 'No user conv',
      });

      const res = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/conversations?userId=user-1`
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.conversations).toHaveLength(1);
      expect(body.data.conversations[0].title).toBe('User 1 conv');
      expect(body.data.conversations[0].userId).toBe('user-1');
    });

    it('should support pagination', async () => {
      const tenantId = await createTestTenantWithOrg('manage-conv-page');
      const projectId = 'default-project';
      await createTestProject(manageDbClient, tenantId, projectId);

      for (let i = 0; i < 5; i++) {
        await createTestConversation({ tenantId, projectId, title: `Conv ${i}` });
      }

      const res = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/conversations?page=1&limit=2`
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.conversations).toHaveLength(2);
      expect(body.data.pagination.total).toBe(5);
      expect(body.data.pagination.hasMore).toBe(true);
      expect(body.data.pagination.page).toBe(1);
      expect(body.data.pagination.limit).toBe(2);
    });

    it('should return empty list for project with no conversations', async () => {
      const tenantId = await createTestTenantWithOrg('manage-conv-empty');
      const projectId = 'default-project';
      await createTestProject(manageDbClient, tenantId, projectId);

      const res = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/conversations`
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.conversations).toHaveLength(0);
      expect(body.data.pagination.total).toBe(0);
      expect(body.data.pagination.hasMore).toBe(false);
    });

    it('keeps internal tool_result artifacts on the builder console path (D2 regression guard)', async () => {
      // D2: the end-user surfaces strip internal tool_result artifacts, but the
      // builder/admin console must keep them. The manage detail endpoint is a
      // separate code path (formatConversationDetail + formatMessagesForLLMContext)
      // that never routes through toVercelMessage / isInternalToolResultArtifactData,
      // so the suppression is structurally absent here. This guards against a future
      // refactor leaking the strip into the manage path: GET-ing a conversation that
      // carries a tool_result artifact must still return the message end-to-end.
      const tenantId = await createTestTenantWithOrg('manage-conv-tool-result');
      const projectId = 'default-project';
      await createTestProject(manageDbClient, tenantId, projectId);

      const conv = await createTestConversation({
        tenantId,
        projectId,
        title: 'Conversation with internal artifact',
        agentId: 'support-agent',
      });

      const internalArtifactId = 'compress_tool_call_d2';
      const internalToolCallId = 'call-internal-d2';
      await addLedgerArtifacts(runDbClient)({
        scopes: { tenantId, projectId },
        contextId: conv.id,
        taskId: `task-${crypto.randomUUID()}`,
        toolCallId: internalToolCallId,
        artifacts: [
          {
            artifactId: internalArtifactId,
            name: 'Tool result',
            description: 'compressed to save context space',
            type: 'tool_result',
            parts: [{ kind: 'data', data: { summary: { content: 'internal plumbing' } } }],
            metadata: { artifactType: 'tool_result' },
            createdAt: new Date().toISOString(),
          },
        ],
      });

      const messageId = `msg-${crypto.randomUUID()}`;
      await createMessage(runDbClient)({
        scopes: { tenantId, projectId },
        data: {
          id: messageId,
          conversationId: conv.id,
          role: 'agent',
          content: {
            text: 'Here is your answer grounded on internal tooling.',
            parts: [
              { kind: 'text', text: 'Here is your answer grounded on internal tooling.' },
              {
                kind: 'data',
                data: JSON.stringify({
                  artifactId: internalArtifactId,
                  toolCallId: internalToolCallId,
                }),
              },
            ],
          },
          visibility: 'user-facing',
          messageType: 'chat',
        },
      });

      const res = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/conversations/${conv.id}`
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      const messages = body.data.conversation.messages;
      const msg = messages.find((m: { id: string }) => m.id === messageId);
      expect(msg).toBeDefined();
      expect(msg.content).toBe('Here is your answer grounded on internal tooling.');
      expect(body.data.formatted.llmContext).toContain(
        'Here is your answer grounded on internal tooling.'
      );
    });

    it('should include userId field in manage response', async () => {
      const tenantId = await createTestTenantWithOrg('manage-conv-fields');
      const projectId = 'default-project';
      await createTestProject(manageDbClient, tenantId, projectId);

      await createTestConversation({
        tenantId,
        projectId,
        userId: 'anon_test-user',
        title: 'Test conv',
        agentId: 'support-agent',
      });

      const res = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/conversations`
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      const conv = body.data.conversations[0];
      expect(conv.id).toBeDefined();
      expect(conv.agentId).toBe('support-agent');
      expect(conv.userId).toBe('anon_test-user');
      expect(conv.title).toBe('Test conv');
      expect(conv.createdAt).toBeDefined();
      expect(conv.updatedAt).toBeDefined();
    });
  });

  describe('GET /manage/tenants/:tenantId/projects/:projectId/conversations/:id?format=vercel', () => {
    it('returns 200 with vercel-shaped messages and normalizes agent role to assistant', async () => {
      const tenantId = await createTestTenantWithOrg('manage-conv-vercel-happy');
      const projectId = 'default-project';
      await createTestProject(manageDbClient, tenantId, projectId);

      const conv = await createTestConversation({ tenantId, projectId, title: 'Vercel test' });

      await createMessage(runDbClient)({
        scopes: { tenantId, projectId },
        data: {
          id: `msg-user-${crypto.randomUUID()}`,
          conversationId: conv.id,
          role: 'user',
          content: { text: 'Hello' },
          visibility: 'user-facing',
          messageType: 'chat',
        },
      });

      await createMessage(runDbClient)({
        scopes: { tenantId, projectId },
        data: {
          id: `msg-agent-${crypto.randomUUID()}`,
          conversationId: conv.id,
          role: 'agent',
          content: { text: 'Hi there!' },
          visibility: 'user-facing',
          messageType: 'chat',
        },
      });

      const res = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/conversations/${conv.id}?format=vercel`
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.id).toBe(conv.id);
      expect(body.data.agentId).toBe('test-agent');
      expect(body.data.title).toBe('Vercel test');
      expect(body.data.createdAt).toBeDefined();
      expect(body.data.updatedAt).toBeDefined();
      expect(body.data.messages).toHaveLength(2);

      const [userMsg, assistantMsg] = body.data.messages;
      expect(userMsg.role).toBe('user');
      expect(userMsg.content).toBe('Hello');
      expect(userMsg.parts).toEqual([{ type: 'text', text: 'Hello' }]);

      expect(assistantMsg.role).toBe('assistant');
      expect(assistantMsg.content).toBe('Hi there!');
      expect(assistantMsg.parts).toEqual([{ type: 'text', text: 'Hi there!' }]);
    });

    it('returns 200 with empty messages[] for a conversation with no messages', async () => {
      const tenantId = await createTestTenantWithOrg('manage-conv-vercel-empty');
      const projectId = 'default-project';
      await createTestProject(manageDbClient, tenantId, projectId);

      const conv = await createTestConversation({ tenantId, projectId, title: 'Empty conv' });

      const res = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/conversations/${conv.id}?format=vercel`
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.id).toBe(conv.id);
      expect(body.data.messages).toEqual([]);
    });

    it('returns 404 for a nonexistent conversation id', async () => {
      const tenantId = await createTestTenantWithOrg('manage-conv-vercel-notfound');
      const projectId = 'default-project';
      await createTestProject(manageDbClient, tenantId, projectId);

      const res = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/conversations/nonexistent-id?format=vercel`
      );

      expect(res.status).toBe(404);
    });

    it('suppresses internal tool_result artifacts in format=vercel (intentional user-facing view)', async () => {
      const tenantId = await createTestTenantWithOrg('manage-conv-vercel-suppress');
      const projectId = 'default-project';
      await createTestProject(manageDbClient, tenantId, projectId);

      const conv = await createTestConversation({
        tenantId,
        projectId,
        title: 'Artifact suppression test',
      });

      const internalArtifactId = 'compress_tool_call_vercel';
      const internalToolCallId = 'call-internal-vercel';
      await addLedgerArtifacts(runDbClient)({
        scopes: { tenantId, projectId },
        contextId: conv.id,
        taskId: `task-${crypto.randomUUID()}`,
        toolCallId: internalToolCallId,
        artifacts: [
          {
            artifactId: internalArtifactId,
            name: 'Tool result',
            description: 'compressed to save context space',
            type: 'tool_result',
            parts: [{ kind: 'data', data: { summary: { content: 'internal plumbing' } } }],
            metadata: { artifactType: 'tool_result' },
            createdAt: new Date().toISOString(),
          },
        ],
      });

      const messageId = `msg-${crypto.randomUUID()}`;
      await createMessage(runDbClient)({
        scopes: { tenantId, projectId },
        data: {
          id: messageId,
          conversationId: conv.id,
          role: 'agent',
          content: {
            text: 'Here is your answer.',
            parts: [
              { kind: 'text', text: 'Here is your answer.' },
              {
                kind: 'data',
                data: JSON.stringify({
                  artifactId: internalArtifactId,
                  toolCallId: internalToolCallId,
                }),
              },
            ],
          },
          visibility: 'user-facing',
          messageType: 'chat',
        },
      });

      const res = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/conversations/${conv.id}?format=vercel`
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      const msg = body.data.messages.find((m: { id: string }) => m.id === messageId);
      expect(msg).toBeDefined();
      expect(msg.content).toBe('Here is your answer.');
      const artifactParts = msg.parts.filter((p: { type: string }) => p.type === 'data-artifact');
      expect(artifactParts).toHaveLength(0);
    });
  });
});
