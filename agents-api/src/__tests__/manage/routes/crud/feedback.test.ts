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

    const createRes = await makeRequest(
      `/manage/tenants/${tenantId}/projects/${projectId}/feedback`,
      {
        method: 'POST',
        body: JSON.stringify(createData),
      }
    );
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

  it('should get feedback by id with all fields persisted', async () => {
    const tenantId = await createTestTenantWithOrg('feedback-get-project');
    await createTestProject(manageDbClient, tenantId, projectId);
    const { conversationId } = await createTestConversation({ tenantId });

    const createData = {
      id: `feedback_${generateId(10)}`,
      conversationId,
      messageId: `msg_${generateId(10)}`,
      type: 'positive',
      details: 'Great answer!',
    };

    const createRes = await makeRequest(
      `/manage/tenants/${tenantId}/projects/${projectId}/feedback`,
      {
        method: 'POST',
        body: JSON.stringify(createData),
      }
    );
    expect(createRes.status).toBe(201);

    const getRes = await makeRequest(
      `/manage/tenants/${tenantId}/projects/${projectId}/feedback/${createData.id}`
    );
    expect(getRes.status).toBe(200);
    const getBody = await getRes.json();

    expect(getBody.data).toMatchObject({
      id: createData.id,
      conversationId,
      messageId: createData.messageId,
      type: 'positive',
      details: 'Great answer!',
    });
    expect(getBody.data.createdAt).toBeDefined();
    expect(getBody.data.updatedAt).toBeDefined();
    expect(getBody.data).not.toHaveProperty('tenantId');
    expect(getBody.data).not.toHaveProperty('projectId');
  });

  it('should update feedback type and details via PATCH', async () => {
    const tenantId = await createTestTenantWithOrg('feedback-update-project');
    await createTestProject(manageDbClient, tenantId, projectId);
    const { conversationId } = await createTestConversation({ tenantId });

    const createData = {
      id: `feedback_${generateId(10)}`,
      conversationId,
      type: 'negative',
      details: 'Original details.',
    };

    await makeRequest(`/manage/tenants/${tenantId}/projects/${projectId}/feedback`, {
      method: 'POST',
      body: JSON.stringify(createData),
    });

    const patchRes = await makeRequest(
      `/manage/tenants/${tenantId}/projects/${projectId}/feedback/${createData.id}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ type: 'positive', details: 'Updated details.' }),
      }
    );
    expect(patchRes.status).toBe(200);
    const patchBody = await patchRes.json();
    expect(patchBody.data.type).toBe('positive');
    expect(patchBody.data.details).toBe('Updated details.');

    const getRes = await makeRequest(
      `/manage/tenants/${tenantId}/projects/${projectId}/feedback/${createData.id}`
    );
    expect(getRes.status).toBe(200);
    const getBody = await getRes.json();
    expect(getBody.data.type).toBe('positive');
    expect(getBody.data.details).toBe('Updated details.');
    expect(getBody.data.conversationId).toBe(conversationId);
  });

  it('should filter feedback by type', async () => {
    const tenantId = await createTestTenantWithOrg('feedback-filter-project');
    await createTestProject(manageDbClient, tenantId, projectId);
    const { conversationId } = await createTestConversation({ tenantId });

    const positive = {
      id: `feedback_${generateId(10)}`,
      conversationId,
      type: 'positive',
      details: 'Liked it.',
    };
    const negative = {
      id: `feedback_${generateId(10)}`,
      conversationId,
      type: 'negative',
      details: 'Did not like it.',
    };

    await makeRequest(`/manage/tenants/${tenantId}/projects/${projectId}/feedback`, {
      method: 'POST',
      body: JSON.stringify(positive),
    });
    await makeRequest(`/manage/tenants/${tenantId}/projects/${projectId}/feedback`, {
      method: 'POST',
      body: JSON.stringify(negative),
    });

    const positiveRes = await makeRequest(
      `/manage/tenants/${tenantId}/projects/${projectId}/feedback?type=positive`
    );
    expect(positiveRes.status).toBe(200);
    const positiveBody = await positiveRes.json();
    expect(positiveBody.pagination.total).toBe(1);
    expect(positiveBody.data[0].type).toBe('positive');

    const negativeRes = await makeRequest(
      `/manage/tenants/${tenantId}/projects/${projectId}/feedback?type=negative`
    );
    expect(negativeRes.status).toBe(200);
    const negativeBody = await negativeRes.json();
    expect(negativeBody.pagination.total).toBe(1);
    expect(negativeBody.data[0].type).toBe('negative');
  });

  it('should create conversation-level feedback without messageId', async () => {
    const tenantId = await createTestTenantWithOrg('feedback-conv-project');
    await createTestProject(manageDbClient, tenantId, projectId);
    const { conversationId } = await createTestConversation({ tenantId });

    const createData = {
      id: `feedback_${generateId(10)}`,
      conversationId,
      type: 'negative',
      details: 'Conversation-level feedback.',
    };

    const createRes = await makeRequest(
      `/manage/tenants/${tenantId}/projects/${projectId}/feedback`,
      { method: 'POST', body: JSON.stringify(createData) }
    );
    expect(createRes.status).toBe(201);

    const getRes = await makeRequest(
      `/manage/tenants/${tenantId}/projects/${projectId}/feedback/${createData.id}`
    );
    expect(getRes.status).toBe(200);
    const getBody = await getRes.json();
    expect(getBody.data.messageId).toBeNull();
    expect(getBody.data.conversationId).toBe(conversationId);
    expect(getBody.data.details).toBe('Conversation-level feedback.');
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

    const createRes = await makeRequest(
      `/manage/tenants/${tenantId}/projects/${projectId}/feedback`,
      {
        method: 'POST',
        body: JSON.stringify(createData),
      }
    );
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
