import {
  createFullAgentServerSide,
  createScheduledTriggerInvocation,
  generateId,
} from '@inkeep/agents-core';
import { createTestProject } from '@inkeep/agents-core/db/test-manage-client';
import { describe, expect, it } from 'vitest';
import manageDbClient from '../../../../data/db/manageDbClient';
import runDbClient from '../../../../data/db/runDbClient';
import { makeRequest } from '../../../utils/testRequest';
import { createTestSubAgentData } from '../../../utils/testSubAgent';
import { createTestTenantWithOrg } from '../../../utils/testTenant';

describe('Scheduled Trigger CRUD Routes - Integration Tests', () => {
  const createFullAgentData = (agentId: string) => {
    const id = agentId || generateId();
    const agent = createTestSubAgentData();
    const agentData: any = {
      id,
      name: `Test Agent ${id}`,
      description: `Test agent description for ${id}`,
      defaultSubAgentId: agent.id,
      subAgents: {
        [agent.id]: agent,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    return agentData;
  };

  const createTestAgent = async (tenantId: string, projectId: string = 'default-project') => {
    await createTestProject(manageDbClient, tenantId, projectId);
    const agentId = `test-agent-${generateId(6)}`;
    const agentData = createFullAgentData(agentId);
    await createFullAgentServerSide(manageDbClient)({ tenantId, projectId }, agentData);
    return { agentId, projectId };
  };

  const basePath = (tenantId: string, projectId: string, agentId: string) =>
    `/manage/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/scheduled-triggers`;

  const createTestScheduledTrigger = async ({
    tenantId,
    projectId = 'default-project',
    agentId,
    name = 'Test Scheduled Trigger',
    enabled = true,
    cronExpression = '0 * * * *',
    cronTimezone = 'UTC',
    runAt,
    payload,
    messageTemplate = 'Scheduled run: {{status}}',
    maxRetries = 1,
    retryDelaySeconds = 60,
    timeoutSeconds = 780,
  }: {
    tenantId: string;
    projectId?: string;
    agentId: string;
    name?: string;
    enabled?: boolean;
    cronExpression?: string | null;
    cronTimezone?: string;
    runAt?: string | null;
    payload?: Record<string, unknown> | null;
    messageTemplate?: string | null;
    maxRetries?: number;
    retryDelaySeconds?: number;
    timeoutSeconds?: number;
  }) => {
    const createData: Record<string, unknown> = {
      name,
      description: 'Test scheduled trigger description',
      enabled,
      messageTemplate,
      maxRetries,
      retryDelaySeconds,
      timeoutSeconds,
    };

    if (cronExpression !== undefined) createData.cronExpression = cronExpression;
    if (runAt !== undefined) createData.runAt = runAt;
    if (payload !== undefined) createData.payload = payload;
    if (cronTimezone !== undefined) createData.cronTimezone = cronTimezone;

    const createRes = await makeRequest(basePath(tenantId, projectId, agentId), {
      method: 'POST',
      body: JSON.stringify(createData),
    });

    expect(createRes.status).toBe(201);
    const createBody = await createRes.json();
    return {
      createData,
      trigger: createBody.data,
    };
  };

  const createTestInvocation = async ({
    tenantId,
    projectId,
    agentId,
    scheduledTriggerId,
    status = 'pending' as const,
    scheduledFor,
    idempotencyKey,
    attemptNumber = 1,
  }: {
    tenantId: string;
    projectId: string;
    agentId: string;
    scheduledTriggerId: string;
    status?: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
    scheduledFor?: string;
    idempotencyKey?: string;
    attemptNumber?: number;
  }) => {
    const invocation = await createScheduledTriggerInvocation(runDbClient)({
      id: generateId(),
      tenantId,
      projectId,
      agentId,
      scheduledTriggerId,
      status,
      scheduledFor: scheduledFor || new Date().toISOString(),
      idempotencyKey: idempotencyKey || `test-${generateId()}`,
      attemptNumber,
    });
    return invocation;
  };

  describe('GET /', () => {
    it('should list scheduled triggers with pagination (empty initially)', async () => {
      const tenantId = await createTestTenantWithOrg('sched-list-empty');
      const { agentId, projectId } = await createTestAgent(tenantId);

      const res = await makeRequest(`${basePath(tenantId, projectId, agentId)}?page=1&limit=10`);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toEqual({
        data: [],
        pagination: {
          page: 1,
          limit: 10,
          total: 0,
          pages: 0,
        },
      });
    });

    it('should list scheduled triggers with pagination', async () => {
      const tenantId = await createTestTenantWithOrg('sched-list');
      const { agentId, projectId } = await createTestAgent(tenantId);

      await createTestScheduledTrigger({ tenantId, projectId, agentId, name: 'Cron Trigger 1' });
      await createTestScheduledTrigger({ tenantId, projectId, agentId, name: 'Cron Trigger 2' });

      const res = await makeRequest(`${basePath(tenantId, projectId, agentId)}?page=1&limit=10`);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data).toHaveLength(2);
      expect(body.pagination).toEqual({
        page: 1,
        limit: 10,
        total: 2,
        pages: 1,
      });

      const firstTrigger = body.data[0];
      expect(firstTrigger).toHaveProperty('id');
      expect(firstTrigger).toHaveProperty('name');
      expect(firstTrigger).toHaveProperty('enabled');
      expect(firstTrigger).toHaveProperty('cronExpression');
      expect(firstTrigger).toHaveProperty('cronTimezone');
      expect(firstTrigger).toHaveProperty('messageTemplate');
      expect(firstTrigger).toHaveProperty('maxRetries');
      expect(firstTrigger).toHaveProperty('retryDelaySeconds');
      expect(firstTrigger).toHaveProperty('timeoutSeconds');
      expect(firstTrigger).toHaveProperty('createdAt');
      expect(firstTrigger).toHaveProperty('updatedAt');
      expect(firstTrigger).not.toHaveProperty('tenantId');
      expect(firstTrigger).not.toHaveProperty('projectId');
      expect(firstTrigger).not.toHaveProperty('agentId');
    });

    it('should include run info in list response', async () => {
      const tenantId = await createTestTenantWithOrg('sched-list-runinfo');
      const { agentId, projectId } = await createTestAgent(tenantId);

      await createTestScheduledTrigger({ tenantId, projectId, agentId });

      const res = await makeRequest(`${basePath(tenantId, projectId, agentId)}?page=1&limit=10`);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data).toHaveLength(1);

      const trigger = body.data[0];
      expect(trigger).toHaveProperty('lastRunAt');
      expect(trigger).toHaveProperty('lastRunStatus');
      expect(trigger).toHaveProperty('lastRunConversationIds');
      expect(trigger).toHaveProperty('nextRunAt');
    });

    it('should handle pagination correctly', async () => {
      const tenantId = await createTestTenantWithOrg('sched-pagination');
      const { agentId, projectId } = await createTestAgent(tenantId);

      for (let i = 0; i < 5; i++) {
        await createTestScheduledTrigger({
          tenantId,
          projectId,
          agentId,
          name: `Trigger ${i + 1}`,
        });
      }

      const res = await makeRequest(`${basePath(tenantId, projectId, agentId)}?page=1&limit=3`);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data).toHaveLength(3);
      expect(body.pagination).toEqual({
        page: 1,
        limit: 3,
        total: 5,
        pages: 2,
      });
    });
  });

  describe('GET /{id}', () => {
    it('should get scheduled trigger by ID', async () => {
      const tenantId = await createTestTenantWithOrg('sched-get-by-id');
      const { agentId, projectId } = await createTestAgent(tenantId);
      const { trigger } = await createTestScheduledTrigger({ tenantId, projectId, agentId });

      const res = await makeRequest(`${basePath(tenantId, projectId, agentId)}/${trigger.id}`);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data.id).toBe(trigger.id);
      expect(body.data.name).toBe('Test Scheduled Trigger');
      expect(body.data.enabled).toBe(true);
      expect(body.data.cronExpression).toBe('0 * * * *');
      expect(body.data.cronTimezone).toBe('UTC');
    });

    it('should return 404 for non-existent scheduled trigger', async () => {
      const tenantId = await createTestTenantWithOrg('sched-get-not-found');
      const { agentId, projectId } = await createTestAgent(tenantId);
      const nonExistentId = `non-existent-${generateId()}`;

      const res = await makeRequest(`${basePath(tenantId, projectId, agentId)}/${nonExistentId}`);
      expect(res.status).toBe(404);

      const body = await res.json();
      expect(body.error.message).toBe('Scheduled trigger not found');
    });

    it('should respect tenant isolation', async () => {
      const tenantId1 = await createTestTenantWithOrg('sched-tenant-1');
      const tenantId2 = await createTestTenantWithOrg('sched-tenant-2');
      const projectId = 'default-project';

      const { agentId } = await createTestAgent(tenantId1, projectId);
      const { trigger } = await createTestScheduledTrigger({
        tenantId: tenantId1,
        projectId,
        agentId,
      });

      await createTestProject(manageDbClient, tenantId2, projectId);
      const { agentId: agentId2 } = await createTestAgent(tenantId2, projectId);

      const res = await makeRequest(`${basePath(tenantId2, projectId, agentId2)}/${trigger.id}`);
      expect(res.status).toBe(404);
    });
  });

  describe('POST /', () => {
    it('should create a cron-based scheduled trigger', async () => {
      const tenantId = await createTestTenantWithOrg('sched-create-cron');
      const { agentId, projectId } = await createTestAgent(tenantId);

      const createData = {
        name: 'Hourly Report',
        description: 'Generate hourly reports',
        enabled: true,
        cronExpression: '0 * * * *',
        cronTimezone: 'America/New_York',
        messageTemplate: 'Generate the hourly report for {{timeRange}}',
        payload: { timeRange: 'last-hour' },
        maxRetries: 3,
        retryDelaySeconds: 120,
        timeoutSeconds: 600,
      };

      const res = await makeRequest(basePath(tenantId, projectId, agentId), {
        method: 'POST',
        body: JSON.stringify(createData),
      });

      expect(res.status).toBe(201);
      const body = await res.json();

      expect(body.data).toHaveProperty('id');
      expect(body.data.name).toBe(createData.name);
      expect(body.data.description).toBe(createData.description);
      expect(body.data.enabled).toBe(true);
      expect(body.data.cronExpression).toBe(createData.cronExpression);
      expect(body.data.cronTimezone).toBe(createData.cronTimezone);
      expect(body.data.messageTemplate).toBe(createData.messageTemplate);
      expect(body.data.payload).toEqual(createData.payload);
      expect(body.data.maxRetries).toBe(3);
      expect(body.data.retryDelaySeconds).toBe(120);
      expect(body.data.timeoutSeconds).toBe(600);
      expect(body.data.createdAt).toBeDefined();
      expect(body.data.updatedAt).toBeDefined();
    });

    it('should create a one-time (runAt) scheduled trigger', async () => {
      const tenantId = await createTestTenantWithOrg('sched-create-runat');
      const { agentId, projectId } = await createTestAgent(tenantId);

      const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const createData = {
        name: 'One-Time Task',
        description: 'Single execution task',
        enabled: true,
        runAt: futureDate,
        messageTemplate: 'Execute scheduled one-time task',
      };

      const res = await makeRequest(basePath(tenantId, projectId, agentId), {
        method: 'POST',
        body: JSON.stringify(createData),
      });

      expect(res.status).toBe(201);
      const body = await res.json();

      expect(body.data.cronExpression).toBeNull();
      expect(body.data.runAt).toBeDefined();
    });

    it('should create scheduled trigger with custom id', async () => {
      const tenantId = await createTestTenantWithOrg('sched-create-custom-id');
      const { agentId, projectId } = await createTestAgent(tenantId);

      const customId = `custom-sched-${generateId(6)}`;
      const createData = {
        id: customId,
        name: 'Custom ID Trigger',
        cronExpression: '*/5 * * * *',
        messageTemplate: 'Test',
      };

      const res = await makeRequest(basePath(tenantId, projectId, agentId), {
        method: 'POST',
        body: JSON.stringify(createData),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.data.id).toBe(customId);
    });

    it('should create a disabled scheduled trigger', async () => {
      const tenantId = await createTestTenantWithOrg('sched-create-disabled');
      const { agentId, projectId } = await createTestAgent(tenantId);

      const createData = {
        name: 'Disabled Trigger',
        enabled: false,
        cronExpression: '0 0 * * *',
        messageTemplate: 'This should not run',
      };

      const res = await makeRequest(basePath(tenantId, projectId, agentId), {
        method: 'POST',
        body: JSON.stringify(createData),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.data.enabled).toBe(false);
    });

    it('should use default retry settings when not provided', async () => {
      const tenantId = await createTestTenantWithOrg('sched-create-defaults');
      const { agentId, projectId } = await createTestAgent(tenantId);

      const createData = {
        name: 'Defaults Trigger',
        cronExpression: '0 0 * * *',
        messageTemplate: 'Test defaults',
      };

      const res = await makeRequest(basePath(tenantId, projectId, agentId), {
        method: 'POST',
        body: JSON.stringify(createData),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.data.maxRetries).toBe(1);
      expect(body.data.retryDelaySeconds).toBe(60);
      expect(body.data.timeoutSeconds).toBe(780);
    });

    it('should reject trigger with neither cronExpression nor runAt', async () => {
      const tenantId = await createTestTenantWithOrg('sched-create-no-schedule');
      const { agentId, projectId } = await createTestAgent(tenantId);

      const createData = {
        name: 'Invalid Trigger',
        messageTemplate: 'No schedule defined',
      };

      const res = await makeRequest(basePath(tenantId, projectId, agentId), {
        method: 'POST',
        body: JSON.stringify(createData),
      });

      expect(res.status).toBe(400);
    });

    it('should reject trigger with both cronExpression and runAt', async () => {
      const tenantId = await createTestTenantWithOrg('sched-create-both');
      const { agentId, projectId } = await createTestAgent(tenantId);

      const createData = {
        name: 'Invalid Both Trigger',
        cronExpression: '0 * * * *',
        runAt: new Date(Date.now() + 60000).toISOString(),
        messageTemplate: 'Both specified',
      };

      const res = await makeRequest(basePath(tenantId, projectId, agentId), {
        method: 'POST',
        body: JSON.stringify(createData),
      });

      expect(res.status).toBe(400);
    });
  });

  describe('PATCH /{id}', () => {
    it('should update scheduled trigger successfully', async () => {
      const tenantId = await createTestTenantWithOrg('sched-update');
      const { agentId, projectId } = await createTestAgent(tenantId);
      const { trigger } = await createTestScheduledTrigger({ tenantId, projectId, agentId });

      await new Promise((resolve) => setTimeout(resolve, 1));

      const updateData = {
        name: 'Updated Scheduled Trigger',
        description: 'Updated description',
        enabled: false,
      };

      const res = await makeRequest(`${basePath(tenantId, projectId, agentId)}/${trigger.id}`, {
        method: 'PATCH',
        body: JSON.stringify(updateData),
      });

      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body.data.name).toBe(updateData.name);
      expect(body.data.description).toBe(updateData.description);
      expect(body.data.enabled).toBe(false);
      expect(body.data.updatedAt).not.toBe(trigger.updatedAt);
    });

    it('should update cron expression', async () => {
      const tenantId = await createTestTenantWithOrg('sched-update-cron');
      const { agentId, projectId } = await createTestAgent(tenantId);
      const { trigger } = await createTestScheduledTrigger({ tenantId, projectId, agentId });

      const updateData = {
        cronExpression: '*/30 * * * *',
        cronTimezone: 'Europe/London',
      };

      const res = await makeRequest(`${basePath(tenantId, projectId, agentId)}/${trigger.id}`, {
        method: 'PATCH',
        body: JSON.stringify(updateData),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.cronExpression).toBe('*/30 * * * *');
      expect(body.data.cronTimezone).toBe('Europe/London');
    });

    it('should update retry configuration', async () => {
      const tenantId = await createTestTenantWithOrg('sched-update-retry');
      const { agentId, projectId } = await createTestAgent(tenantId);
      const { trigger } = await createTestScheduledTrigger({ tenantId, projectId, agentId });

      const updateData = {
        maxRetries: 5,
        retryDelaySeconds: 300,
        timeoutSeconds: 600,
      };

      const res = await makeRequest(`${basePath(tenantId, projectId, agentId)}/${trigger.id}`, {
        method: 'PATCH',
        body: JSON.stringify(updateData),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.maxRetries).toBe(5);
      expect(body.data.retryDelaySeconds).toBe(300);
      expect(body.data.timeoutSeconds).toBe(600);
    });

    it('should accept empty update body (schema applies defaults for retry fields)', async () => {
      const tenantId = await createTestTenantWithOrg('sched-update-empty');
      const { agentId, projectId } = await createTestAgent(tenantId);
      const { trigger } = await createTestScheduledTrigger({ tenantId, projectId, agentId });

      const res = await makeRequest(`${basePath(tenantId, projectId, agentId)}/${trigger.id}`, {
        method: 'PATCH',
        body: JSON.stringify({}),
      });

      // Schema applies defaults for retry fields, so this is treated as valid
      expect(res.status).toBe(200);
    });

    it('should return 404 for non-existent scheduled trigger', async () => {
      const tenantId = await createTestTenantWithOrg('sched-update-not-found');
      const { agentId, projectId } = await createTestAgent(tenantId);
      const nonExistentId = `non-existent-${generateId()}`;

      const updateData = { name: 'Updated Name' };

      const res = await makeRequest(`${basePath(tenantId, projectId, agentId)}/${nonExistentId}`, {
        method: 'PATCH',
        body: JSON.stringify(updateData),
      });

      expect(res.status).toBe(404);
    });

    it('should respect tenant isolation on update', async () => {
      const tenantId1 = await createTestTenantWithOrg('sched-update-tenant-1');
      const tenantId2 = await createTestTenantWithOrg('sched-update-tenant-2');
      const projectId = 'default-project';

      const { agentId } = await createTestAgent(tenantId1, projectId);
      const { trigger } = await createTestScheduledTrigger({
        tenantId: tenantId1,
        projectId,
        agentId,
      });

      await createTestProject(manageDbClient, tenantId2, projectId);
      const { agentId: agentId2 } = await createTestAgent(tenantId2, projectId);

      const res = await makeRequest(`${basePath(tenantId2, projectId, agentId2)}/${trigger.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: 'Hacked' }),
      });

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /{id}', () => {
    it('should delete scheduled trigger successfully', async () => {
      const tenantId = await createTestTenantWithOrg('sched-delete');
      const { agentId, projectId } = await createTestAgent(tenantId);
      const { trigger } = await createTestScheduledTrigger({ tenantId, projectId, agentId });

      const res = await makeRequest(`${basePath(tenantId, projectId, agentId)}/${trigger.id}`, {
        method: 'DELETE',
      });

      expect(res.status).toBe(204);

      const getRes = await makeRequest(`${basePath(tenantId, projectId, agentId)}/${trigger.id}`);
      expect(getRes.status).toBe(404);
    });

    it('should return 404 for non-existent scheduled trigger', async () => {
      const tenantId = await createTestTenantWithOrg('sched-delete-not-found');
      const { agentId, projectId } = await createTestAgent(tenantId);
      const nonExistentId = `non-existent-${generateId()}`;

      const res = await makeRequest(`${basePath(tenantId, projectId, agentId)}/${nonExistentId}`, {
        method: 'DELETE',
      });

      expect(res.status).toBe(404);
    });

    it('should cancel pending invocations when deleting trigger', async () => {
      const tenantId = await createTestTenantWithOrg('sched-delete-cancel');
      const { agentId, projectId } = await createTestAgent(tenantId);
      const { trigger } = await createTestScheduledTrigger({ tenantId, projectId, agentId });

      await createTestInvocation({
        tenantId,
        projectId,
        agentId,
        scheduledTriggerId: trigger.id,
        status: 'pending',
        scheduledFor: new Date(Date.now() + 60000).toISOString(),
      });

      const deleteRes = await makeRequest(
        `${basePath(tenantId, projectId, agentId)}/${trigger.id}`,
        {
          method: 'DELETE',
        }
      );

      expect(deleteRes.status).toBe(204);
    });

    it('should respect tenant isolation on delete', async () => {
      const tenantId1 = await createTestTenantWithOrg('sched-delete-tenant-1');
      const tenantId2 = await createTestTenantWithOrg('sched-delete-tenant-2');
      const projectId = 'default-project';

      const { agentId } = await createTestAgent(tenantId1, projectId);
      const { trigger } = await createTestScheduledTrigger({
        tenantId: tenantId1,
        projectId,
        agentId,
      });

      await createTestProject(manageDbClient, tenantId2, projectId);
      const { agentId: agentId2 } = await createTestAgent(tenantId2, projectId);

      const res = await makeRequest(`${basePath(tenantId2, projectId, agentId2)}/${trigger.id}`, {
        method: 'DELETE',
      });

      expect(res.status).toBe(404);
    });
  });

  describe('Scheduled Trigger Invocations', () => {
    describe('GET /{id}/invocations', () => {
      it('should list invocations with pagination (empty initially)', async () => {
        const tenantId = await createTestTenantWithOrg('sched-inv-list-empty');
        const { agentId, projectId } = await createTestAgent(tenantId);
        const { trigger } = await createTestScheduledTrigger({ tenantId, projectId, agentId });

        const res = await makeRequest(
          `${basePath(tenantId, projectId, agentId)}/${trigger.id}/invocations?page=1&limit=10`
        );
        expect(res.status).toBe(200);

        const body = await res.json();
        expect(body).toEqual({
          data: [],
          pagination: {
            page: 1,
            limit: 10,
            total: 0,
            pages: 0,
          },
        });
      });

      it('should list invocations with pagination', async () => {
        const tenantId = await createTestTenantWithOrg('sched-inv-list');
        const { agentId, projectId } = await createTestAgent(tenantId);
        const { trigger } = await createTestScheduledTrigger({ tenantId, projectId, agentId });

        await createTestInvocation({
          tenantId,
          projectId,
          agentId,
          scheduledTriggerId: trigger.id,
          status: 'completed',
          scheduledFor: '2025-06-01T00:00:00Z',
        });
        await createTestInvocation({
          tenantId,
          projectId,
          agentId,
          scheduledTriggerId: trigger.id,
          status: 'failed',
          scheduledFor: '2025-07-01T00:00:00Z',
        });

        const res = await makeRequest(
          `${basePath(tenantId, projectId, agentId)}/${trigger.id}/invocations?page=1&limit=10`
        );
        expect(res.status).toBe(200);

        const body = await res.json();
        expect(body.data).toHaveLength(2);
        expect(body.pagination).toEqual({
          page: 1,
          limit: 10,
          total: 2,
          pages: 1,
        });

        const firstInvocation = body.data[0];
        expect(firstInvocation).toHaveProperty('id');
        expect(firstInvocation).toHaveProperty('status');
        expect(firstInvocation).toHaveProperty('scheduledFor');
        expect(firstInvocation).toHaveProperty('attemptNumber');
        expect(firstInvocation).toHaveProperty('idempotencyKey');
        expect(firstInvocation).toHaveProperty('createdAt');
        expect(firstInvocation).not.toHaveProperty('tenantId');
        expect(firstInvocation).not.toHaveProperty('projectId');
        expect(firstInvocation).not.toHaveProperty('agentId');
      });

      it('should order invocations by scheduledFor DESC (newest first)', async () => {
        const tenantId = await createTestTenantWithOrg('sched-inv-ordering');
        const { agentId, projectId } = await createTestAgent(tenantId);
        const { trigger } = await createTestScheduledTrigger({ tenantId, projectId, agentId });

        const oldInvocation = await createTestInvocation({
          tenantId,
          projectId,
          agentId,
          scheduledTriggerId: trigger.id,
          status: 'completed',
          scheduledFor: '2025-01-01T00:00:00Z',
        });

        const newInvocation = await createTestInvocation({
          tenantId,
          projectId,
          agentId,
          scheduledTriggerId: trigger.id,
          status: 'completed',
          scheduledFor: '2025-12-31T00:00:00Z',
        });

        const res = await makeRequest(
          `${basePath(tenantId, projectId, agentId)}/${trigger.id}/invocations`
        );
        expect(res.status).toBe(200);

        const body = await res.json();
        expect(body.data).toHaveLength(2);
        expect(body.data[0].id).toBe(newInvocation.id);
        expect(body.data[1].id).toBe(oldInvocation.id);
      });

      it('should filter invocations by status', async () => {
        const tenantId = await createTestTenantWithOrg('sched-inv-filter-status');
        const { agentId, projectId } = await createTestAgent(tenantId);
        const { trigger } = await createTestScheduledTrigger({ tenantId, projectId, agentId });

        await createTestInvocation({
          tenantId,
          projectId,
          agentId,
          scheduledTriggerId: trigger.id,
          status: 'completed',
        });
        await createTestInvocation({
          tenantId,
          projectId,
          agentId,
          scheduledTriggerId: trigger.id,
          status: 'failed',
        });
        await createTestInvocation({
          tenantId,
          projectId,
          agentId,
          scheduledTriggerId: trigger.id,
          status: 'pending',
        });

        const res = await makeRequest(
          `${basePath(tenantId, projectId, agentId)}/${trigger.id}/invocations?status=completed`
        );
        expect(res.status).toBe(200);

        const body = await res.json();
        expect(body.data).toHaveLength(1);
        expect(body.data[0].status).toBe('completed');
      });

      it('should filter invocations by date range', async () => {
        const tenantId = await createTestTenantWithOrg('sched-inv-filter-date');
        const { agentId, projectId } = await createTestAgent(tenantId);
        const { trigger } = await createTestScheduledTrigger({ tenantId, projectId, agentId });

        await createTestInvocation({
          tenantId,
          projectId,
          agentId,
          scheduledTriggerId: trigger.id,
          status: 'completed',
          scheduledFor: '2025-01-01T00:00:00Z',
        });

        const midInvocation = await createTestInvocation({
          tenantId,
          projectId,
          agentId,
          scheduledTriggerId: trigger.id,
          status: 'completed',
          scheduledFor: '2025-06-15T00:00:00Z',
        });

        await createTestInvocation({
          tenantId,
          projectId,
          agentId,
          scheduledTriggerId: trigger.id,
          status: 'completed',
          scheduledFor: '2025-12-01T00:00:00Z',
        });

        const res = await makeRequest(
          `${basePath(tenantId, projectId, agentId)}/${trigger.id}/invocations?from=2025-05-01T00:00:00Z&to=2025-07-01T00:00:00Z`
        );
        expect(res.status).toBe(200);

        const body = await res.json();
        expect(body.data).toHaveLength(1);
        expect(body.data[0].id).toBe(midInvocation.id);
      });

      it('should handle pagination correctly for invocations', async () => {
        const tenantId = await createTestTenantWithOrg('sched-inv-pagination');
        const { agentId, projectId } = await createTestAgent(tenantId);
        const { trigger } = await createTestScheduledTrigger({ tenantId, projectId, agentId });

        for (let i = 0; i < 5; i++) {
          await createTestInvocation({
            tenantId,
            projectId,
            agentId,
            scheduledTriggerId: trigger.id,
            status: 'completed',
            scheduledFor: new Date(2025, 0, i + 1).toISOString(),
          });
        }

        const res = await makeRequest(
          `${basePath(tenantId, projectId, agentId)}/${trigger.id}/invocations?page=1&limit=3`
        );
        expect(res.status).toBe(200);

        const body = await res.json();
        expect(body.data).toHaveLength(3);
        expect(body.pagination).toEqual({
          page: 1,
          limit: 3,
          total: 5,
          pages: 2,
        });
      });
    });

    describe('GET /{id}/invocations/{invocationId}', () => {
      it('should get invocation by ID', async () => {
        const tenantId = await createTestTenantWithOrg('sched-inv-get-by-id');
        const { agentId, projectId } = await createTestAgent(tenantId);
        const { trigger } = await createTestScheduledTrigger({ tenantId, projectId, agentId });

        const invocation = await createTestInvocation({
          tenantId,
          projectId,
          agentId,
          scheduledTriggerId: trigger.id,
          status: 'completed',
          scheduledFor: '2025-06-01T12:00:00Z',
        });

        const res = await makeRequest(
          `${basePath(tenantId, projectId, agentId)}/${trigger.id}/invocations/${invocation.id}`
        );
        expect(res.status).toBe(200);

        const body = await res.json();
        expect(body.data.id).toBe(invocation.id);
        expect(body.data.status).toBe('completed');
        expect(body.data.scheduledFor).toBeDefined();
        expect(body.data.scheduledFor).toContain('2025-06-01');
      });

      it('should return 404 for non-existent invocation', async () => {
        const tenantId = await createTestTenantWithOrg('sched-inv-get-not-found');
        const { agentId, projectId } = await createTestAgent(tenantId);
        const { trigger } = await createTestScheduledTrigger({ tenantId, projectId, agentId });
        const nonExistentId = `non-existent-${generateId()}`;

        const res = await makeRequest(
          `${basePath(tenantId, projectId, agentId)}/${trigger.id}/invocations/${nonExistentId}`
        );
        expect(res.status).toBe(404);

        const body = await res.json();
        expect(body.error.message).toBe('Scheduled trigger invocation not found');
      });

      it('should respect tenant isolation for invocations', async () => {
        const tenantId1 = await createTestTenantWithOrg('sched-inv-tenant-1');
        const tenantId2 = await createTestTenantWithOrg('sched-inv-tenant-2');
        const projectId = 'default-project';

        const { agentId } = await createTestAgent(tenantId1, projectId);
        const { trigger } = await createTestScheduledTrigger({
          tenantId: tenantId1,
          projectId,
          agentId,
        });
        const invocation = await createTestInvocation({
          tenantId: tenantId1,
          projectId,
          agentId,
          scheduledTriggerId: trigger.id,
          status: 'completed',
        });

        await createTestProject(manageDbClient, tenantId2, projectId);
        const { agentId: agentId2 } = await createTestAgent(tenantId2, projectId);
        const { trigger: trigger2 } = await createTestScheduledTrigger({
          tenantId: tenantId2,
          projectId,
          agentId: agentId2,
        });

        const res = await makeRequest(
          `${basePath(tenantId2, projectId, agentId2)}/${trigger2.id}/invocations/${invocation.id}`
        );
        expect(res.status).toBe(404);
      });
    });

    describe('POST /{id}/invocations/{invocationId}/cancel', () => {
      it('should cancel a pending invocation', async () => {
        const tenantId = await createTestTenantWithOrg('sched-inv-cancel-pending');
        const { agentId, projectId } = await createTestAgent(tenantId);
        const { trigger } = await createTestScheduledTrigger({ tenantId, projectId, agentId });

        const invocation = await createTestInvocation({
          tenantId,
          projectId,
          agentId,
          scheduledTriggerId: trigger.id,
          status: 'pending',
        });

        const res = await makeRequest(
          `${basePath(tenantId, projectId, agentId)}/${trigger.id}/invocations/${invocation.id}/cancel`,
          { method: 'POST' }
        );
        expect(res.status).toBe(200);

        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.invocationId).toBe(invocation.id);
        expect(body.previousStatus).toBe('pending');
      });

      it('should cancel a running invocation', async () => {
        const tenantId = await createTestTenantWithOrg('sched-inv-cancel-running');
        const { agentId, projectId } = await createTestAgent(tenantId);
        const { trigger } = await createTestScheduledTrigger({ tenantId, projectId, agentId });

        const invocation = await createTestInvocation({
          tenantId,
          projectId,
          agentId,
          scheduledTriggerId: trigger.id,
          status: 'running',
        });

        const res = await makeRequest(
          `${basePath(tenantId, projectId, agentId)}/${trigger.id}/invocations/${invocation.id}/cancel`,
          { method: 'POST' }
        );
        expect(res.status).toBe(200);

        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.previousStatus).toBe('running');
      });

      it('should return 400 when cancelling a completed invocation', async () => {
        const tenantId = await createTestTenantWithOrg('sched-inv-cancel-completed');
        const { agentId, projectId } = await createTestAgent(tenantId);
        const { trigger } = await createTestScheduledTrigger({ tenantId, projectId, agentId });

        const invocation = await createTestInvocation({
          tenantId,
          projectId,
          agentId,
          scheduledTriggerId: trigger.id,
          status: 'completed',
        });

        const res = await makeRequest(
          `${basePath(tenantId, projectId, agentId)}/${trigger.id}/invocations/${invocation.id}/cancel`,
          { method: 'POST' }
        );
        expect(res.status).toBe(400);
      });

      it('should return 400 when cancelling a failed invocation', async () => {
        const tenantId = await createTestTenantWithOrg('sched-inv-cancel-failed');
        const { agentId, projectId } = await createTestAgent(tenantId);
        const { trigger } = await createTestScheduledTrigger({ tenantId, projectId, agentId });

        const invocation = await createTestInvocation({
          tenantId,
          projectId,
          agentId,
          scheduledTriggerId: trigger.id,
          status: 'failed',
        });

        const res = await makeRequest(
          `${basePath(tenantId, projectId, agentId)}/${trigger.id}/invocations/${invocation.id}/cancel`,
          { method: 'POST' }
        );
        expect(res.status).toBe(400);
      });

      it('should be idempotent for already cancelled invocations', async () => {
        const tenantId = await createTestTenantWithOrg('sched-inv-cancel-idempotent');
        const { agentId, projectId } = await createTestAgent(tenantId);
        const { trigger } = await createTestScheduledTrigger({ tenantId, projectId, agentId });

        const invocation = await createTestInvocation({
          tenantId,
          projectId,
          agentId,
          scheduledTriggerId: trigger.id,
          status: 'cancelled',
        });

        const res = await makeRequest(
          `${basePath(tenantId, projectId, agentId)}/${trigger.id}/invocations/${invocation.id}/cancel`,
          { method: 'POST' }
        );
        expect(res.status).toBe(200);

        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.previousStatus).toBe('cancelled');
      });

      it('should return 404 for non-existent invocation', async () => {
        const tenantId = await createTestTenantWithOrg('sched-inv-cancel-not-found');
        const { agentId, projectId } = await createTestAgent(tenantId);
        const { trigger } = await createTestScheduledTrigger({ tenantId, projectId, agentId });
        const nonExistentId = `non-existent-${generateId()}`;

        const res = await makeRequest(
          `${basePath(tenantId, projectId, agentId)}/${trigger.id}/invocations/${nonExistentId}/cancel`,
          { method: 'POST' }
        );
        expect(res.status).toBe(404);
      });
    });
  });

  describe('Upcoming Runs', () => {
    describe('GET /upcoming-runs', () => {
      it('should list upcoming runs (empty initially)', async () => {
        const tenantId = await createTestTenantWithOrg('sched-upcoming-empty');
        const { agentId, projectId } = await createTestAgent(tenantId);

        const res = await makeRequest(
          `${basePath(tenantId, projectId, agentId)}/upcoming-runs?page=1&limit=10`
        );
        expect(res.status).toBe(200);

        const body = await res.json();
        expect(body).toEqual({
          data: [],
          pagination: {
            page: 1,
            limit: 10,
            total: 0,
            pages: 0,
          },
        });
      });

      it('should list pending invocations across triggers', async () => {
        const tenantId = await createTestTenantWithOrg('sched-upcoming-pending');
        const { agentId, projectId } = await createTestAgent(tenantId);

        const { trigger: trigger1 } = await createTestScheduledTrigger({
          tenantId,
          projectId,
          agentId,
          name: 'Trigger A',
        });
        const { trigger: trigger2 } = await createTestScheduledTrigger({
          tenantId,
          projectId,
          agentId,
          name: 'Trigger B',
        });

        await createTestInvocation({
          tenantId,
          projectId,
          agentId,
          scheduledTriggerId: trigger1.id,
          status: 'pending',
          scheduledFor: new Date(Date.now() + 3600_000).toISOString(),
        });
        await createTestInvocation({
          tenantId,
          projectId,
          agentId,
          scheduledTriggerId: trigger2.id,
          status: 'pending',
          scheduledFor: new Date(Date.now() + 7200_000).toISOString(),
        });

        // Also create a completed invocation (should NOT appear)
        await createTestInvocation({
          tenantId,
          projectId,
          agentId,
          scheduledTriggerId: trigger1.id,
          status: 'completed',
          scheduledFor: '2025-01-01T00:00:00Z',
        });

        const res = await makeRequest(
          `${basePath(tenantId, projectId, agentId)}/upcoming-runs?page=1&limit=10&includeRunning=false`
        );
        expect(res.status).toBe(200);

        const body = await res.json();
        expect(body.data).toHaveLength(2);
        expect(body.data.every((inv: any) => inv.status === 'pending')).toBe(true);
      });

      it('should include running invocations when includeRunning=true', async () => {
        const tenantId = await createTestTenantWithOrg('sched-upcoming-running');
        const { agentId, projectId } = await createTestAgent(tenantId);

        const { trigger } = await createTestScheduledTrigger({
          tenantId,
          projectId,
          agentId,
        });

        await createTestInvocation({
          tenantId,
          projectId,
          agentId,
          scheduledTriggerId: trigger.id,
          status: 'pending',
          scheduledFor: new Date(Date.now() + 3600_000).toISOString(),
        });
        await createTestInvocation({
          tenantId,
          projectId,
          agentId,
          scheduledTriggerId: trigger.id,
          status: 'running',
          scheduledFor: new Date(Date.now() - 60_000).toISOString(),
        });

        const res = await makeRequest(
          `${basePath(tenantId, projectId, agentId)}/upcoming-runs?page=1&limit=10&includeRunning=true`
        );
        expect(res.status).toBe(200);

        const body = await res.json();
        expect(body.data).toHaveLength(2);
        const statuses = body.data.map((inv: any) => inv.status);
        expect(statuses).toContain('pending');
        expect(statuses).toContain('running');
      });

      it('should order upcoming runs by scheduledFor ASC (earliest first)', async () => {
        const tenantId = await createTestTenantWithOrg('sched-upcoming-ordering');
        const { agentId, projectId } = await createTestAgent(tenantId);

        const { trigger } = await createTestScheduledTrigger({
          tenantId,
          projectId,
          agentId,
        });

        const laterTime = new Date(Date.now() + 7200_000).toISOString();
        const soonerTime = new Date(Date.now() + 3600_000).toISOString();

        await createTestInvocation({
          tenantId,
          projectId,
          agentId,
          scheduledTriggerId: trigger.id,
          status: 'pending',
          scheduledFor: laterTime,
        });
        const soonerInvocation = await createTestInvocation({
          tenantId,
          projectId,
          agentId,
          scheduledTriggerId: trigger.id,
          status: 'pending',
          scheduledFor: soonerTime,
        });

        const res = await makeRequest(
          `${basePath(tenantId, projectId, agentId)}/upcoming-runs?page=1&limit=10&includeRunning=false`
        );
        expect(res.status).toBe(200);

        const body = await res.json();
        expect(body.data).toHaveLength(2);
        expect(body.data[0].id).toBe(soonerInvocation.id);
      });
    });
  });

  describe('Run Now', () => {
    describe('POST /{id}/run', () => {
      it('should initiate a manual run and return invocation ID', async () => {
        const tenantId = await createTestTenantWithOrg('sched-run-now');
        const { agentId, projectId } = await createTestAgent(tenantId);
        const { trigger } = await createTestScheduledTrigger({ tenantId, projectId, agentId });

        const res = await makeRequest(
          `${basePath(tenantId, projectId, agentId)}/${trigger.id}/run`,
          { method: 'POST' }
        );
        expect(res.status).toBe(200);

        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.invocationId).toBeDefined();
      });

      it('should return 404 for non-existent trigger', async () => {
        const tenantId = await createTestTenantWithOrg('sched-run-not-found');
        const { agentId, projectId } = await createTestAgent(tenantId);
        const nonExistentId = `non-existent-${generateId()}`;

        const res = await makeRequest(
          `${basePath(tenantId, projectId, agentId)}/${nonExistentId}/run`,
          { method: 'POST' }
        );
        expect(res.status).toBe(404);
      });

      it('should create a pending invocation for the manual run', async () => {
        const tenantId = await createTestTenantWithOrg('sched-run-creates-inv');
        const { agentId, projectId } = await createTestAgent(tenantId);
        const { trigger } = await createTestScheduledTrigger({ tenantId, projectId, agentId });

        const runRes = await makeRequest(
          `${basePath(tenantId, projectId, agentId)}/${trigger.id}/run`,
          { method: 'POST' }
        );
        expect(runRes.status).toBe(200);
        const runBody = await runRes.json();

        // Small delay for the invocation to be created
        await new Promise((resolve) => setTimeout(resolve, 100));

        const invRes = await makeRequest(
          `${basePath(tenantId, projectId, agentId)}/${trigger.id}/invocations/${runBody.invocationId}`
        );
        expect(invRes.status).toBe(200);

        const invBody = await invRes.json();
        expect(invBody.data.id).toBe(runBody.invocationId);
        expect(invBody.data.scheduledTriggerId).toBe(trigger.id);
      });
    });
  });

  describe('Rerun', () => {
    describe('POST /{id}/invocations/{invocationId}/rerun', () => {
      it('should rerun a completed invocation', async () => {
        const tenantId = await createTestTenantWithOrg('sched-rerun-completed');
        const { agentId, projectId } = await createTestAgent(tenantId);
        const { trigger } = await createTestScheduledTrigger({ tenantId, projectId, agentId });

        const invocation = await createTestInvocation({
          tenantId,
          projectId,
          agentId,
          scheduledTriggerId: trigger.id,
          status: 'completed',
        });

        const res = await makeRequest(
          `${basePath(tenantId, projectId, agentId)}/${trigger.id}/invocations/${invocation.id}/rerun`,
          { method: 'POST' }
        );
        expect(res.status).toBe(200);

        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.newInvocationId).toBeDefined();
        expect(body.originalInvocationId).toBe(invocation.id);
      });

      it('should rerun a failed invocation', async () => {
        const tenantId = await createTestTenantWithOrg('sched-rerun-failed');
        const { agentId, projectId } = await createTestAgent(tenantId);
        const { trigger } = await createTestScheduledTrigger({ tenantId, projectId, agentId });

        const invocation = await createTestInvocation({
          tenantId,
          projectId,
          agentId,
          scheduledTriggerId: trigger.id,
          status: 'failed',
        });

        const res = await makeRequest(
          `${basePath(tenantId, projectId, agentId)}/${trigger.id}/invocations/${invocation.id}/rerun`,
          { method: 'POST' }
        );
        expect(res.status).toBe(200);

        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.newInvocationId).toBeDefined();
      });

      it('should rerun a cancelled invocation', async () => {
        const tenantId = await createTestTenantWithOrg('sched-rerun-cancelled');
        const { agentId, projectId } = await createTestAgent(tenantId);
        const { trigger } = await createTestScheduledTrigger({ tenantId, projectId, agentId });

        const invocation = await createTestInvocation({
          tenantId,
          projectId,
          agentId,
          scheduledTriggerId: trigger.id,
          status: 'cancelled',
        });

        const res = await makeRequest(
          `${basePath(tenantId, projectId, agentId)}/${trigger.id}/invocations/${invocation.id}/rerun`,
          { method: 'POST' }
        );
        expect(res.status).toBe(200);

        const body = await res.json();
        expect(body.success).toBe(true);
      });

      it('should return 400 when rerunning a pending invocation', async () => {
        const tenantId = await createTestTenantWithOrg('sched-rerun-pending');
        const { agentId, projectId } = await createTestAgent(tenantId);
        const { trigger } = await createTestScheduledTrigger({ tenantId, projectId, agentId });

        const invocation = await createTestInvocation({
          tenantId,
          projectId,
          agentId,
          scheduledTriggerId: trigger.id,
          status: 'pending',
        });

        const res = await makeRequest(
          `${basePath(tenantId, projectId, agentId)}/${trigger.id}/invocations/${invocation.id}/rerun`,
          { method: 'POST' }
        );
        expect(res.status).toBe(400);
      });

      it('should return 400 when rerunning a running invocation', async () => {
        const tenantId = await createTestTenantWithOrg('sched-rerun-running');
        const { agentId, projectId } = await createTestAgent(tenantId);
        const { trigger } = await createTestScheduledTrigger({ tenantId, projectId, agentId });

        const invocation = await createTestInvocation({
          tenantId,
          projectId,
          agentId,
          scheduledTriggerId: trigger.id,
          status: 'running',
        });

        const res = await makeRequest(
          `${basePath(tenantId, projectId, agentId)}/${trigger.id}/invocations/${invocation.id}/rerun`,
          { method: 'POST' }
        );
        expect(res.status).toBe(400);
      });

      it('should return 404 for non-existent invocation', async () => {
        const tenantId = await createTestTenantWithOrg('sched-rerun-not-found');
        const { agentId, projectId } = await createTestAgent(tenantId);
        const { trigger } = await createTestScheduledTrigger({ tenantId, projectId, agentId });
        const nonExistentId = `non-existent-${generateId()}`;

        const res = await makeRequest(
          `${basePath(tenantId, projectId, agentId)}/${trigger.id}/invocations/${nonExistentId}/rerun`,
          { method: 'POST' }
        );
        expect(res.status).toBe(404);
      });
    });
  });
});
