import { createConversation, generateId } from '@inkeep/agents-core';
import { createTestProject } from '@inkeep/agents-core/db/test-manage-client';
import { describe, expect, it } from 'vitest';
import manageDbClient from '../../../../../data/db/manageDbClient';
import runDbClient from '../../../../../data/db/runDbClient';
import { makeRequest } from '../../../../utils/testRequest';
import { createTestTenantWithOrg } from '../../../../utils/testTenant';

describe('Feedback CRUD Routes - Integration Tests', () => {
  const projectId = 'default';

  const createTestConversation = async ({ tenantId }: { tenantId: string }) => {
    const conversationId = generateId(16);
    await createConversation(runDbClient)({
      id: conversationId,
      tenantId,
      projectId,
      agentId: 'test-agent',
      activeSubAgentId: 'test-agent',
      ref: { type: 'branch', name: 'main', hash: 'test-hash' },
    });
    return { conversationId };
  };

  it('should create feedback and list it without conversation filter', async () => {
    const tenantId = await createTestTenantWithOrg('feedback-list-project');
    await createTestProject(manageDbClient, tenantId, projectId);
    const { conversationId } = await createTestConversation({ tenantId });

    const createData = {
      id: `feedback_${generateId(10)}`,
      conversationId,
      messageId: `msg_${generateId(10)}`,
      type: 'negative',
      details: 'Improve the response clarity.',
    };

    const createRes = await makeRequest(`/manage/tenants/${tenantId}/projects/${projectId}/feedback`, {
      method: 'POST',
      body: JSON.stringify(createData),
    });
    expect(createRes.status).toBe(201);

    const listRes = await makeRequest(
      `/manage/tenants/${tenantId}/projects/${projectId}/feedback?page=1&limit=10`
    );
    expect(listRes.status).toBe(200);
    const listBody = await listRes.json();

    expect(listBody.pagination).toEqual({
      page: 1,
      limit: 10,
      total: 1,
      pages: 1,
    });
    expect(listBody.data[0]).toMatchObject({
      id: createData.id,
      conversationId,
      messageId: createData.messageId,
      type: 'negative',
      details: createData.details,
    });
    // API should not expose tenant/project scope
    expect(listBody.data[0]).not.toHaveProperty('tenantId');
    expect(listBody.data[0]).not.toHaveProperty('projectId');
  });

  it('should delete feedback', async () => {
    const tenantId = await createTestTenantWithOrg('feedback-delete-project');
    await createTestProject(manageDbClient, tenantId, projectId);
    const { conversationId } = await createTestConversation({ tenantId });

    const createData = {
      id: `feedback_${generateId(10)}`,
      conversationId,
      messageId: `msg_${generateId(10)}`,
      type: 'negative',
      details: 'Delete me.',
    };

    const createRes = await makeRequest(`/manage/tenants/${tenantId}/projects/${projectId}/feedback`, {
      method: 'POST',
      body: JSON.stringify(createData),
    });
    expect(createRes.status).toBe(201);

    const deleteRes = await makeRequest(
      `/manage/tenants/${tenantId}/projects/${projectId}/feedback/${createData.id}`,
      { method: 'DELETE' }
    );
    expect(deleteRes.status).toBe(200);
    const deleteBody = await deleteRes.json();
    expect(deleteBody).toEqual({ success: true });

    const listRes = await makeRequest(
      `/manage/tenants/${tenantId}/projects/${projectId}/feedback?page=1&limit=10`
    );
    expect(listRes.status).toBe(200);
    const listBody = await listRes.json();
    expect(listBody.pagination.total).toBe(0);
    expect(listBody.data).toEqual([]);
  });
});

