import { generateId } from '@inkeep/agents-core';
import { createTestProject } from '@inkeep/agents-core/db/test-manage-client';
import { describe, expect, it } from 'vitest';
import manageDbClient from '../../../../data/db/manageDbClient';
import { makeRequest } from '../../../utils/testRequest';
import { createTestSubAgentData } from '../../../utils/testSubAgent';
import { createTestTenantWithOrg } from '../../../utils/testTenant';

describe('Agent Duplication - Integration Tests', () => {
  const projectId = 'default';

  const createAgentData = ({
    defaultSubAgentId = null,
  }: {
    defaultSubAgentId?: string | null;
  } = {}) => {
    const id = generateId();
    return {
      id,
      name: id,
      defaultSubAgentId,
      contextConfigId: null,
    };
  };

  const createTestSubAgent = async ({
    tenantId,
    agentId,
    suffix = '',
  }: {
    tenantId: string;
    agentId: string;
    suffix?: string;
  }) => {
    const agentData = createTestSubAgentData({ suffix });
    const createRes = await makeRequest(
      `/manage/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/sub-agents`,
      {
        method: 'POST',
        body: JSON.stringify(agentData),
      }
    );
    expect(createRes.status).toBe(201);

    const createBody = await createRes.json();
    return { agentData, subAgentId: createBody.data.id };
  };

  const createTestAgent = async ({
    tenantId,
    defaultSubAgentId = null,
  }: {
    tenantId: string;
    defaultSubAgentId?: string | null;
  }) => {
    const agentData = createAgentData({ defaultSubAgentId });
    const createRes = await makeRequest(
      `/manage/tenants/${tenantId}/projects/${projectId}/agents`,
      {
        method: 'POST',
        body: JSON.stringify(agentData),
      }
    );
    expect(createRes.status).toBe(201);

    const createBody = await createRes.json();
    return { agentData, agentId: createBody.data.id };
  };

  describe('POST /{agentId}/duplicate', () => {
    it('should successfully duplicate an agent with new ID and name', async () => {
      const tenantId = await createTestTenantWithOrg('agent-duplicate-success');
      await createTestProject(manageDbClient, tenantId, projectId);

      const { agentId } = await createTestAgent({ tenantId });
      const { subAgentId } = await createTestSubAgent({ tenantId, agentId });

      await makeRequest(`/manage/tenants/${tenantId}/projects/${projectId}/agents/${agentId}`, {
        method: 'PUT',
        body: JSON.stringify({ defaultSubAgentId: subAgentId }),
      });

      const newAgentId = generateId();
      const newAgentName = 'Duplicated Agent';

      const res = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/duplicate`,
        {
          method: 'POST',
          body: JSON.stringify({
            newAgentId,
            newAgentName,
          }),
        }
      );

      expect(res.status).toBe(201);

      const body = await res.json();
      expect(body.data).toMatchObject({
        id: newAgentId,
        name: newAgentName,
        tenantId,
        projectId,
      });
      expect(body.data.createdAt).toBeDefined();
      expect(body.data.updatedAt).toBeDefined();

      const getRes = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/agents/${newAgentId}`
      );
      expect(getRes.status).toBe(200);
    });

    it('should duplicate agent with default name when newAgentName is not provided', async () => {
      const tenantId = await createTestTenantWithOrg('agent-duplicate-default-name');
      await createTestProject(manageDbClient, tenantId, projectId);

      const { agentId, agentData } = await createTestAgent({ tenantId });

      const newAgentId = generateId();

      const res = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/duplicate`,
        {
          method: 'POST',
          body: JSON.stringify({
            newAgentId,
          }),
        }
      );

      expect(res.status).toBe(201);

      const body = await res.json();
      expect(body.data.id).toBe(newAgentId);
      expect(body.data.name).toBe(`${agentData.name} (Copy)`);
    });

    it('should return 404 when original agent not found', async () => {
      const tenantId = await createTestTenantWithOrg('agent-duplicate-not-found');
      await createTestProject(manageDbClient, tenantId, projectId);

      const newAgentId = generateId();

      const res = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/agents/non-existent-agent/duplicate`,
        {
          method: 'POST',
          body: JSON.stringify({
            newAgentId,
          }),
        }
      );

      expect(res.status).toBe(404);

      const body = await res.json();
      expect(body).toEqual({
        code: 'not_found',
        detail: 'Agent not found',
        error: {
          code: 'not_found',
          message: 'Agent not found',
        },
        status: 404,
        title: 'Not Found',
      });
    });

    it('should return 409 when newAgentId already exists', async () => {
      const tenantId = await createTestTenantWithOrg('agent-duplicate-conflict');
      await createTestProject(manageDbClient, tenantId, projectId);

      const { agentId } = await createTestAgent({ tenantId });
      const { agentId: existingAgentId } = await createTestAgent({ tenantId });

      const res = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/duplicate`,
        {
          method: 'POST',
          body: JSON.stringify({
            newAgentId: existingAgentId,
          }),
        }
      );

      expect(res.status).toBe(409);

      const body = await res.json();
      expect(body).toEqual({
        code: 'conflict',
        detail: `An agent with ID '${existingAgentId}' already exists`,
        error: {
          code: 'conflict',
          message: `An agent with ID '${existingAgentId}' already exists`,
        },
        status: 409,
        title: 'Conflict',
      });
    });

    it('should return 400 when newAgentId is invalid', async () => {
      const tenantId = await createTestTenantWithOrg('agent-duplicate-invalid-id');
      await createTestProject(manageDbClient, tenantId, projectId);

      const { agentId } = await createTestAgent({ tenantId });

      const res = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/duplicate`,
        {
          method: 'POST',
          body: JSON.stringify({
            newAgentId: 'a',
          }),
        }
      );

      expect(res.status).toBe(400);
    });

    it('should return 400 when newAgentId contains invalid characters', async () => {
      const tenantId = await createTestTenantWithOrg('agent-duplicate-invalid-chars');
      await createTestProject(manageDbClient, tenantId, projectId);

      const { agentId } = await createTestAgent({ tenantId });

      const res = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/duplicate`,
        {
          method: 'POST',
          body: JSON.stringify({
            newAgentId: 'invalid@id#with$special',
          }),
        }
      );

      expect(res.status).toBe(400);
    });

    it('should return 400 when request body is missing newAgentId', async () => {
      const tenantId = await createTestTenantWithOrg('agent-duplicate-missing-id');
      await createTestProject(manageDbClient, tenantId, projectId);

      const { agentId } = await createTestAgent({ tenantId });

      const res = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/duplicate`,
        {
          method: 'POST',
          body: JSON.stringify({}),
        }
      );

      expect(res.status).toBe(400);
    });

    it('should duplicate agent with all sub-agents and relationships', async () => {
      const tenantId = await createTestTenantWithOrg('agent-duplicate-with-subagents');
      await createTestProject(manageDbClient, tenantId, projectId);

      const { agentId } = await createTestAgent({ tenantId });
      const { subAgentId: subAgent1Id } = await createTestSubAgent({
        tenantId,
        agentId,
        suffix: ' 1',
      });
      const { subAgentId: subAgent2Id } = await createTestSubAgent({
        tenantId,
        agentId,
        suffix: ' 2',
      });

      await makeRequest(`/manage/tenants/${tenantId}/projects/${projectId}/agents/${agentId}`, {
        method: 'PUT',
        body: JSON.stringify({ defaultSubAgentId: subAgent1Id }),
      });

      const newAgentId = generateId();

      const res = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/duplicate`,
        {
          method: 'POST',
          body: JSON.stringify({
            newAgentId,
          }),
        }
      );

      expect(res.status).toBe(201);

      const fullAgentRes = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/agents/${newAgentId}/full`
      );
      expect(fullAgentRes.status).toBe(200);

      const fullAgentBody = await fullAgentRes.json();
      expect(fullAgentBody.data.subAgents).toBeDefined();
      expect(Object.keys(fullAgentBody.data.subAgents)).toHaveLength(2);
      expect(fullAgentBody.data.subAgents[subAgent1Id]).toBeDefined();
      expect(fullAgentBody.data.subAgents[subAgent2Id]).toBeDefined();
    });
  });
});
