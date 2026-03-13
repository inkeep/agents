import { createConversation } from '@inkeep/agents-core';
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
});
