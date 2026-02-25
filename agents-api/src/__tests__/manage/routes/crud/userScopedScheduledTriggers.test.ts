import {
  createFullAgentServerSide,
  createScheduledTriggerInvocation,
  deleteScheduledTriggersByRunAsUserId,
  generateId,
  listScheduledTriggers,
  OrgRoles,
  type ScheduledTrigger,
} from '@inkeep/agents-core';
import { createTestProject } from '@inkeep/agents-core/db/test-manage-client';
import { describe, expect, it, vi } from 'vitest';
import manageDbClient from '../../../../data/db/manageDbClient';
import runDbClient from '../../../../data/db/runDbClient';
import {
  assertCanMutateTrigger,
  isScheduledTriggerChanged,
} from '../../../../domains/manage/routes/scheduledTriggers';
import { makeRequest } from '../../../utils/testRequest';
import { createTestSubAgentData } from '../../../utils/testSubAgent';
import { createTestTenantWithOrg } from '../../../utils/testTenant';

vi.mock('@inkeep/agents-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@inkeep/agents-core')>();
  return {
    ...actual,
    canUseProjectStrict: vi.fn(() => Promise.resolve(true)),
  };
});

const { canUseProjectStrict } = await import('@inkeep/agents-core');
const canUseProjectStrictMock = vi.mocked(canUseProjectStrict);

describe('User-Scoped Scheduled Triggers', () => {
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

  const createTriggerWithUserId = async (params: {
    tenantId: string;
    projectId: string;
    agentId: string;
    runAsUserId?: string;
  }) => {
    const { tenantId, projectId, agentId, runAsUserId } = params;
    const createData: Record<string, unknown> = {
      name: 'User-scoped trigger',
      cronExpression: '0 * * * *',
      messageTemplate: 'Scheduled run',
    };
    if (runAsUserId !== undefined) {
      createData.runAsUserId = runAsUserId;
    }
    const res = await makeRequest(basePath(tenantId, projectId, agentId), {
      method: 'POST',
      body: JSON.stringify(createData),
    });
    return res;
  };

  describe('Create trigger with runAsUserId', () => {
    it('should create trigger with runAsUserId set to caller (self-scheduling)', async () => {
      const tenantId = await createTestTenantWithOrg('us-self-sched');
      const { agentId, projectId } = await createTestAgent(tenantId);
      canUseProjectStrictMock.mockResolvedValue(true);

      const res = await createTriggerWithUserId({
        tenantId,
        projectId,
        agentId,
        runAsUserId: 'anonymous',
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.data.runAsUserId).toBe('anonymous');
      expect(body.data.createdBy).toBe('anonymous');
    });

    it('should create trigger with runAsUserId set to different user (admin delegation)', async () => {
      const tenantId = await createTestTenantWithOrg('us-admin-deleg');
      const { agentId, projectId } = await createTestAgent(tenantId);
      canUseProjectStrictMock.mockResolvedValue(true);

      const res = await createTriggerWithUserId({
        tenantId,
        projectId,
        agentId,
        runAsUserId: 'other-user-123',
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.data.runAsUserId).toBe('other-user-123');
      expect(body.data.createdBy).toBe('anonymous');
    });

    it('should reject when target user lacks project use permission', async () => {
      const tenantId = await createTestTenantWithOrg('us-no-use-perm');
      const { agentId, projectId } = await createTestAgent(tenantId);
      canUseProjectStrictMock.mockResolvedValue(false);

      const res = await createTriggerWithUserId({
        tenantId,
        projectId,
        agentId,
        runAsUserId: 'user-without-access',
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.message).toContain('does not have');
      expect(body.error.message).toContain('use');
    });

    it('should reject system identifier as runAsUserId', async () => {
      const tenantId = await createTestTenantWithOrg('us-reject-system');
      const { agentId, projectId } = await createTestAgent(tenantId);

      for (const systemId of ['system', 'apikey:sk-test-123']) {
        const res = await createTriggerWithUserId({
          tenantId,
          projectId,
          agentId,
          runAsUserId: systemId,
        });

        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error.message).toContain('system identifier');
      }
    });

    it('should normalize empty string runAsUserId to null (legacy behavior)', async () => {
      const tenantId = await createTestTenantWithOrg('us-empty-string');
      const { agentId, projectId } = await createTestAgent(tenantId);

      const createData = {
        name: 'Empty userId trigger',
        cronExpression: '0 * * * *',
        messageTemplate: 'Test',
        runAsUserId: '',
      };

      const res = await makeRequest(basePath(tenantId, projectId, agentId), {
        method: 'POST',
        body: JSON.stringify(createData),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.data.runAsUserId).toBeNull();
    });

    it('should create trigger without runAsUserId (legacy behavior)', async () => {
      const tenantId = await createTestTenantWithOrg('us-legacy-create');
      const { agentId, projectId } = await createTestAgent(tenantId);

      const res = await createTriggerWithUserId({
        tenantId,
        projectId,
        agentId,
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.data.runAsUserId).toBeNull();
    });
  });

  describe('Update trigger runAsUserId', () => {
    it('should update trigger runAsUserId', async () => {
      const tenantId = await createTestTenantWithOrg('us-update-uid');
      const { agentId, projectId } = await createTestAgent(tenantId);
      canUseProjectStrictMock.mockResolvedValue(true);

      const createRes = await createTriggerWithUserId({
        tenantId,
        projectId,
        agentId,
      });
      expect(createRes.status).toBe(201);
      const { data: trigger } = await createRes.json();

      const updateRes = await makeRequest(
        `${basePath(tenantId, projectId, agentId)}/${trigger.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ runAsUserId: 'new-user-456' }),
        }
      );

      expect(updateRes.status).toBe(200);
      const updateBody = await updateRes.json();
      expect(updateBody.data.runAsUserId).toBe('new-user-456');
    });

    it('should reject update when target user lacks project use permission', async () => {
      const tenantId = await createTestTenantWithOrg('us-update-no-perm');
      const { agentId, projectId } = await createTestAgent(tenantId);
      canUseProjectStrictMock.mockResolvedValue(true);

      const createRes = await createTriggerWithUserId({
        tenantId,
        projectId,
        agentId,
      });
      expect(createRes.status).toBe(201);
      const { data: trigger } = await createRes.json();

      canUseProjectStrictMock.mockResolvedValue(false);

      const updateRes = await makeRequest(
        `${basePath(tenantId, projectId, agentId)}/${trigger.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ runAsUserId: 'user-no-access' }),
        }
      );

      expect(updateRes.status).toBe(400);
      const body = await updateRes.json();
      expect(body.error.message).toContain('does not have');
    });
  });

  describe('GET responses include runAsUserId and createdBy', () => {
    it('should return runAsUserId and createdBy in list response', async () => {
      const tenantId = await createTestTenantWithOrg('us-get-list');
      const { agentId, projectId } = await createTestAgent(tenantId);
      canUseProjectStrictMock.mockResolvedValue(true);

      await createTriggerWithUserId({
        tenantId,
        projectId,
        agentId,
        runAsUserId: 'anonymous',
      });

      const res = await makeRequest(`${basePath(tenantId, projectId, agentId)}?page=1&limit=10`);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data).toHaveLength(1);
      expect(body.data[0]).toHaveProperty('runAsUserId');
      expect(body.data[0]).toHaveProperty('createdBy');
      expect(body.data[0].runAsUserId).toBe('anonymous');
      expect(body.data[0].createdBy).toBe('anonymous');
    });

    it('should return runAsUserId and createdBy in get-by-id response', async () => {
      const tenantId = await createTestTenantWithOrg('us-get-byid');
      const { agentId, projectId } = await createTestAgent(tenantId);
      canUseProjectStrictMock.mockResolvedValue(true);

      const createRes = await createTriggerWithUserId({
        tenantId,
        projectId,
        agentId,
        runAsUserId: 'other-user',
      });
      const { data: trigger } = await createRes.json();

      const res = await makeRequest(`${basePath(tenantId, projectId, agentId)}/${trigger.id}`);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data.runAsUserId).toBe('other-user');
      expect(body.data.createdBy).toBe('anonymous');
    });
  });

  describe('Run Now with runAsUserId', () => {
    it('should allow Run Now for trigger with runAsUserId matching caller', async () => {
      const tenantId = await createTestTenantWithOrg('us-run-now-self');
      const { agentId, projectId } = await createTestAgent(tenantId);
      canUseProjectStrictMock.mockResolvedValue(true);

      const createRes = await createTriggerWithUserId({
        tenantId,
        projectId,
        agentId,
        runAsUserId: 'anonymous',
      });
      expect(createRes.status).toBe(201);
      const { data: trigger } = await createRes.json();

      const runRes = await makeRequest(
        `${basePath(tenantId, projectId, agentId)}/${trigger.id}/run`,
        { method: 'POST' }
      );
      expect(runRes.status).toBe(200);

      const body = await runRes.json();
      expect(body.success).toBe(true);
      expect(body.invocationId).toBeDefined();
    });

    it('should allow Run Now for admin-delegated trigger (caller is admin)', async () => {
      const tenantId = await createTestTenantWithOrg('us-run-now-admin');
      const { agentId, projectId } = await createTestAgent(tenantId);
      canUseProjectStrictMock.mockResolvedValue(true);

      const createRes = await createTriggerWithUserId({
        tenantId,
        projectId,
        agentId,
        runAsUserId: 'other-user-789',
      });
      expect(createRes.status).toBe(201);
      const { data: trigger } = await createRes.json();

      const runRes = await makeRequest(
        `${basePath(tenantId, projectId, agentId)}/${trigger.id}/run`,
        { method: 'POST' }
      );
      expect(runRes.status).toBe(200);

      const body = await runRes.json();
      expect(body.success).toBe(true);
    });

    it('should allow Run Now for trigger without runAsUserId (legacy behavior)', async () => {
      const tenantId = await createTestTenantWithOrg('us-run-now-legacy');
      const { agentId, projectId } = await createTestAgent(tenantId);

      const createRes = await createTriggerWithUserId({
        tenantId,
        projectId,
        agentId,
      });
      expect(createRes.status).toBe(201);
      const { data: trigger } = await createRes.json();

      const runRes = await makeRequest(
        `${basePath(tenantId, projectId, agentId)}/${trigger.id}/run`,
        { method: 'POST' }
      );
      expect(runRes.status).toBe(200);

      const body = await runRes.json();
      expect(body.success).toBe(true);
    });
  });

  describe('Rerun with runAsUserId', () => {
    it('should allow rerun for trigger with runAsUserId matching caller', async () => {
      const tenantId = await createTestTenantWithOrg('us-rerun-self');
      const { agentId, projectId } = await createTestAgent(tenantId);
      canUseProjectStrictMock.mockResolvedValue(true);

      const createRes = await createTriggerWithUserId({
        tenantId,
        projectId,
        agentId,
        runAsUserId: 'anonymous',
      });
      expect(createRes.status).toBe(201);
      const { data: trigger } = await createRes.json();

      const invocation = await createScheduledTriggerInvocation(runDbClient)({
        id: generateId(),
        tenantId,
        projectId,
        agentId,
        scheduledTriggerId: trigger.id,
        status: 'completed',
        scheduledFor: new Date().toISOString(),
        idempotencyKey: `test-${generateId()}`,
        attemptNumber: 1,
      });

      const rerunRes = await makeRequest(
        `${basePath(tenantId, projectId, agentId)}/${trigger.id}/invocations/${invocation.id}/rerun`,
        { method: 'POST' }
      );
      expect(rerunRes.status).toBe(200);

      const body = await rerunRes.json();
      expect(body.success).toBe(true);
      expect(body.newInvocationId).toBeDefined();
      expect(body.originalInvocationId).toBe(invocation.id);
    });

    it('should allow rerun for admin-delegated trigger (caller is admin)', async () => {
      const tenantId = await createTestTenantWithOrg('us-rerun-admin');
      const { agentId, projectId } = await createTestAgent(tenantId);
      canUseProjectStrictMock.mockResolvedValue(true);

      const createRes = await createTriggerWithUserId({
        tenantId,
        projectId,
        agentId,
        runAsUserId: 'different-user',
      });
      expect(createRes.status).toBe(201);
      const { data: trigger } = await createRes.json();

      const invocation = await createScheduledTriggerInvocation(runDbClient)({
        id: generateId(),
        tenantId,
        projectId,
        agentId,
        scheduledTriggerId: trigger.id,
        status: 'failed',
        scheduledFor: new Date().toISOString(),
        idempotencyKey: `test-${generateId()}`,
        attemptNumber: 1,
      });

      const rerunRes = await makeRequest(
        `${basePath(tenantId, projectId, agentId)}/${trigger.id}/invocations/${invocation.id}/rerun`,
        { method: 'POST' }
      );
      expect(rerunRes.status).toBe(200);

      const body = await rerunRes.json();
      expect(body.success).toBe(true);
    });

    it('should allow rerun for trigger without runAsUserId (legacy behavior)', async () => {
      const tenantId = await createTestTenantWithOrg('us-rerun-legacy');
      const { agentId, projectId } = await createTestAgent(tenantId);

      const createRes = await createTriggerWithUserId({
        tenantId,
        projectId,
        agentId,
      });
      expect(createRes.status).toBe(201);
      const { data: trigger } = await createRes.json();

      const invocation = await createScheduledTriggerInvocation(runDbClient)({
        id: generateId(),
        tenantId,
        projectId,
        agentId,
        scheduledTriggerId: trigger.id,
        status: 'cancelled',
        scheduledFor: new Date().toISOString(),
        idempotencyKey: `test-${generateId()}`,
        attemptNumber: 1,
      });

      const rerunRes = await makeRequest(
        `${basePath(tenantId, projectId, agentId)}/${trigger.id}/invocations/${invocation.id}/rerun`,
        { method: 'POST' }
      );
      expect(rerunRes.status).toBe(200);

      const body = await rerunRes.json();
      expect(body.success).toBe(true);
    });
  });

  describe('Delegation permission validation logic', () => {
    const validateDelegation = (params: {
      runAsUserId: string;
      callerId: string;
      role: string;
    }) => {
      const { createApiError, OrgRoles } = require('@inkeep/agents-core');
      const { runAsUserId, callerId, role } = params;
      const isAdmin = role === OrgRoles.OWNER || role === OrgRoles.ADMIN;

      if (runAsUserId !== callerId && !isAdmin) {
        throw createApiError({
          code: 'forbidden',
          message: 'Only org admins or owners can set runAsUserId to a different user.',
        });
      }
    };

    const validateRunNow = (params: {
      runAsUserId: string | null;
      callerId: string;
      role: string;
    }) => {
      const { createApiError, OrgRoles } = require('@inkeep/agents-core');
      const { runAsUserId, callerId, role } = params;
      if (!runAsUserId) return;
      if (runAsUserId === callerId) return;
      const isAdmin = role === OrgRoles.OWNER || role === OrgRoles.ADMIN;
      if (!isAdmin) {
        throw createApiError({
          code: 'forbidden',
          message:
            'Only org admins or owners can run triggers configured to run as a different user.',
        });
      }
    };

    it('should reject delegation (runAsUserId != caller) for non-admin users', () => {
      const { OrgRoles } = require('@inkeep/agents-core');
      expect(() =>
        validateDelegation({
          runAsUserId: 'other-user',
          callerId: 'current-user',
          role: OrgRoles.MEMBER,
        })
      ).toThrow(/admins or owners/);
    });

    it('should allow delegation for org owner', () => {
      const { OrgRoles } = require('@inkeep/agents-core');
      expect(() =>
        validateDelegation({
          runAsUserId: 'other-user',
          callerId: 'admin-user',
          role: OrgRoles.OWNER,
        })
      ).not.toThrow();
    });

    it('should allow delegation for org admin', () => {
      const { OrgRoles } = require('@inkeep/agents-core');
      expect(() =>
        validateDelegation({
          runAsUserId: 'other-user',
          callerId: 'admin-user',
          role: OrgRoles.ADMIN,
        })
      ).not.toThrow();
    });

    it('should allow self-scheduling for any role', () => {
      const { OrgRoles } = require('@inkeep/agents-core');
      for (const role of [OrgRoles.MEMBER, OrgRoles.ADMIN, OrgRoles.OWNER]) {
        expect(() =>
          validateDelegation({
            runAsUserId: 'same-user',
            callerId: 'same-user',
            role,
          })
        ).not.toThrow();
      }
    });

    it('should reject Run Now on delegated trigger for non-admin caller', () => {
      const { OrgRoles } = require('@inkeep/agents-core');
      expect(() =>
        validateRunNow({
          runAsUserId: 'other-user',
          callerId: 'current-user',
          role: OrgRoles.MEMBER,
        })
      ).toThrow(/admins or owners/);
    });

    it('should allow Run Now on delegated trigger for admin caller', () => {
      const { OrgRoles } = require('@inkeep/agents-core');
      expect(() =>
        validateRunNow({
          runAsUserId: 'other-user',
          callerId: 'admin-user',
          role: OrgRoles.OWNER,
        })
      ).not.toThrow();
    });

    it('should skip Run Now delegation check when runAsUserId is null', () => {
      const { OrgRoles } = require('@inkeep/agents-core');
      expect(() =>
        validateRunNow({
          runAsUserId: null,
          callerId: 'current-user',
          role: OrgRoles.MEMBER,
        })
      ).not.toThrow();
    });
  });

  describe('Execution context metadata', () => {
    it('should set initiatedBy type to user when runAsUserId is provided', () => {
      const runAsUserId = 'user-123';
      const triggerId = 'trigger-456';
      const metadata = runAsUserId
        ? { initiatedBy: { type: 'user' as const, id: runAsUserId } }
        : { initiatedBy: { type: 'api_key' as const, id: triggerId } };

      expect(metadata.initiatedBy.type).toBe('user');
      expect(metadata.initiatedBy.id).toBe('user-123');
    });

    it('should set initiatedBy type to api_key when runAsUserId is absent', () => {
      const runAsUserId = undefined;
      const triggerId = 'trigger-456';
      const metadata = runAsUserId
        ? { initiatedBy: { type: 'user' as const, id: runAsUserId } }
        : { initiatedBy: { type: 'api_key' as const, id: triggerId } };

      expect(metadata.initiatedBy.type).toBe('api_key');
      expect(metadata.initiatedBy.id).toBe('trigger-456');
    });
  });

  describe('Push flow authorization (isScheduledTriggerChanged + assertCanMutateTrigger)', () => {
    const baseTrigger: ScheduledTrigger = {
      tenantId: 'tenant-1',
      id: 'trigger-1',
      projectId: 'project-1',
      agentId: 'agent-1',
      name: 'Daily sync',
      description: 'Runs daily',
      enabled: true,
      cronExpression: '0 9 * * *',
      cronTimezone: 'UTC',
      runAt: null,
      payload: null,
      messageTemplate: 'Hello',
      maxRetries: 1,
      retryDelaySeconds: 60,
      timeoutSeconds: 780,
      runAsUserId: 'user-a',
      createdBy: 'user-a',
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
    };

    describe('isScheduledTriggerChanged', () => {
      it('should return false when no fields changed', () => {
        const incoming = {
          name: 'Daily sync',
          description: 'Runs daily',
          enabled: true,
          cronExpression: '0 9 * * *',
          cronTimezone: 'UTC',
          runAt: null,
          payload: null,
          messageTemplate: 'Hello',
          maxRetries: 1,
          retryDelaySeconds: 60,
          timeoutSeconds: 780,
          runAsUserId: 'user-a',
        };
        expect(isScheduledTriggerChanged(incoming, baseTrigger)).toBe(false);
      });

      it('should return false when incoming undefined matches existing null', () => {
        const incoming = {
          name: 'Daily sync',
          description: 'Runs daily',
          enabled: true,
          cronExpression: '0 9 * * *',
          cronTimezone: 'UTC',
          messageTemplate: 'Hello',
          maxRetries: 1,
          retryDelaySeconds: 60,
          timeoutSeconds: 780,
          runAsUserId: 'user-a',
        };
        expect(isScheduledTriggerChanged(incoming, baseTrigger)).toBe(false);
      });

      it('should return true when a scalar field changed', () => {
        const incoming = {
          name: 'Weekly sync',
          description: 'Runs daily',
          enabled: true,
          cronExpression: '0 9 * * *',
          cronTimezone: 'UTC',
          messageTemplate: 'Hello',
          maxRetries: 1,
          retryDelaySeconds: 60,
          timeoutSeconds: 780,
          runAsUserId: 'user-a',
        };
        expect(isScheduledTriggerChanged(incoming, baseTrigger)).toBe(true);
      });

      it('should return true when runAsUserId changed', () => {
        const incoming = {
          name: 'Daily sync',
          description: 'Runs daily',
          enabled: true,
          cronExpression: '0 9 * * *',
          cronTimezone: 'UTC',
          messageTemplate: 'Hello',
          maxRetries: 1,
          retryDelaySeconds: 60,
          timeoutSeconds: 780,
          runAsUserId: 'user-b',
        };
        expect(isScheduledTriggerChanged(incoming, baseTrigger)).toBe(true);
      });

      it('should return true when payload changed', () => {
        const incoming = {
          name: 'Daily sync',
          description: 'Runs daily',
          enabled: true,
          cronExpression: '0 9 * * *',
          cronTimezone: 'UTC',
          payload: { key: 'value' },
          messageTemplate: 'Hello',
          maxRetries: 1,
          retryDelaySeconds: 60,
          timeoutSeconds: 780,
          runAsUserId: 'user-a',
        };
        expect(isScheduledTriggerChanged(incoming, baseTrigger)).toBe(true);
      });

      it('should return false when payload objects are deeply equal', () => {
        const triggerWithPayload = { ...baseTrigger, payload: { key: 'value', nested: { a: 1 } } };
        const incoming = {
          name: 'Daily sync',
          description: 'Runs daily',
          enabled: true,
          cronExpression: '0 9 * * *',
          cronTimezone: 'UTC',
          payload: { key: 'value', nested: { a: 1 } },
          messageTemplate: 'Hello',
          maxRetries: 1,
          retryDelaySeconds: 60,
          timeoutSeconds: 780,
          runAsUserId: 'user-a',
        };
        expect(isScheduledTriggerChanged(incoming, triggerWithPayload)).toBe(false);
      });

      it('should ignore identity fields (id, tenantId, projectId, agentId)', () => {
        const incoming = {
          id: 'different-id',
          tenantId: 'different-tenant',
          projectId: 'different-project',
          agentId: 'different-agent',
          name: 'Daily sync',
          description: 'Runs daily',
          enabled: true,
          cronExpression: '0 9 * * *',
          cronTimezone: 'UTC',
          messageTemplate: 'Hello',
          maxRetries: 1,
          retryDelaySeconds: 60,
          timeoutSeconds: 780,
          runAsUserId: 'user-a',
        };
        expect(isScheduledTriggerChanged(incoming, baseTrigger)).toBe(false);
      });

      it('should ignore server-stamped fields (createdBy, createdAt, updatedAt)', () => {
        const incoming = {
          createdBy: 'different-creator',
          createdAt: '2099-01-01T00:00:00Z',
          updatedAt: '2099-01-01T00:00:00Z',
          name: 'Daily sync',
          description: 'Runs daily',
          enabled: true,
          cronExpression: '0 9 * * *',
          cronTimezone: 'UTC',
          messageTemplate: 'Hello',
          maxRetries: 1,
          retryDelaySeconds: 60,
          timeoutSeconds: 780,
          runAsUserId: 'user-a',
        };
        expect(isScheduledTriggerChanged(incoming, baseTrigger)).toBe(false);
      });
    });

    describe('assertCanMutateTrigger', () => {
      it('should allow admins to mutate any trigger', () => {
        expect(() =>
          assertCanMutateTrigger({
            trigger: { createdBy: 'other-user', runAsUserId: 'other-user' },
            callerId: 'admin-user',
            tenantRole: OrgRoles.ADMIN,
          })
        ).not.toThrow();
      });

      it('should allow owners to mutate any trigger', () => {
        expect(() =>
          assertCanMutateTrigger({
            trigger: { createdBy: 'other-user', runAsUserId: 'other-user' },
            callerId: 'owner-user',
            tenantRole: OrgRoles.OWNER,
          })
        ).not.toThrow();
      });

      it('should allow non-admin to mutate trigger they created', () => {
        expect(() =>
          assertCanMutateTrigger({
            trigger: { createdBy: 'member-user', runAsUserId: 'other-user' },
            callerId: 'member-user',
            tenantRole: OrgRoles.MEMBER,
          })
        ).not.toThrow();
      });

      it('should allow non-admin to mutate trigger that runs as them', () => {
        expect(() =>
          assertCanMutateTrigger({
            trigger: { createdBy: 'admin-user', runAsUserId: 'member-user' },
            callerId: 'member-user',
            tenantRole: OrgRoles.MEMBER,
          })
        ).not.toThrow();
      });

      it('should reject non-admin mutating trigger they did not create and does not run as them', () => {
        expect(() =>
          assertCanMutateTrigger({
            trigger: { createdBy: 'other-user', runAsUserId: 'other-user' },
            callerId: 'member-user',
            tenantRole: OrgRoles.MEMBER,
          })
        ).toThrow(/You can only modify triggers/);
      });

      it('should reject non-admin mutating trigger with null createdBy and different runAsUserId', () => {
        expect(() =>
          assertCanMutateTrigger({
            trigger: { createdBy: null, runAsUserId: 'other-user' },
            callerId: 'member-user',
            tenantRole: OrgRoles.MEMBER,
          })
        ).toThrow(/You can only modify triggers/);
      });
    });
  });

  describe('deleteScheduledTriggersByRunAsUserId', () => {
    it('should delete triggers matching runAsUserId and leave others', async () => {
      const tenantId = await createTestTenantWithOrg('del-by-user');
      const { agentId, projectId } = await createTestAgent(tenantId);
      canUseProjectStrictMock.mockResolvedValue(true);

      const userA = 'user-a-del';
      const userB = 'user-b-del';
      const resA = await createTriggerWithUserId({
        tenantId,
        projectId,
        agentId,
        runAsUserId: userA,
      });
      expect(resA.status).toBe(201);
      const resB = await createTriggerWithUserId({
        tenantId,
        projectId,
        agentId,
        runAsUserId: userB,
      });
      expect(resB.status).toBe(201);

      const beforeList = await listScheduledTriggers(manageDbClient)({
        scopes: { tenantId, projectId, agentId },
      });
      expect(beforeList.length).toBe(2);

      await deleteScheduledTriggersByRunAsUserId(manageDbClient)({
        tenantId,
        projectId,
        runAsUserId: userA,
      });

      const afterList = await listScheduledTriggers(manageDbClient)({
        scopes: { tenantId, projectId, agentId },
      });
      expect(afterList.length).toBe(1);
      expect(afterList[0].runAsUserId).toBe(userB);
    });

    it('should be a no-op when no triggers match', async () => {
      const tenantId = await createTestTenantWithOrg('del-noop');
      const { agentId, projectId } = await createTestAgent(tenantId);
      canUseProjectStrictMock.mockResolvedValue(true);

      const res = await createTriggerWithUserId({
        tenantId,
        projectId,
        agentId,
        runAsUserId: 'existing-user',
      });
      expect(res.status).toBe(201);

      await deleteScheduledTriggersByRunAsUserId(manageDbClient)({
        tenantId,
        projectId,
        runAsUserId: 'nonexistent-user',
      });

      const afterList = await listScheduledTriggers(manageDbClient)({
        scopes: { tenantId, projectId, agentId },
      });
      expect(afterList.length).toBe(1);
    });

    it('should delete across multiple agents in the same project', async () => {
      const tenantId = await createTestTenantWithOrg('del-multi-agent');
      const userId = 'shared-user';
      canUseProjectStrictMock.mockResolvedValue(true);

      const { agentId: agent1, projectId } = await createTestAgent(tenantId);

      await createTestProject(manageDbClient, tenantId, projectId);
      const agent2Id = `test-agent-${generateId(6)}`;
      const agent2Data = createFullAgentData(agent2Id);
      await createFullAgentServerSide(manageDbClient)({ tenantId, projectId }, agent2Data);

      await createTriggerWithUserId({ tenantId, projectId, agentId: agent1, runAsUserId: userId });
      await createTriggerWithUserId({
        tenantId,
        projectId,
        agentId: agent2Id,
        runAsUserId: userId,
      });

      await deleteScheduledTriggersByRunAsUserId(manageDbClient)({
        tenantId,
        projectId,
        runAsUserId: userId,
      });

      const list1 = await listScheduledTriggers(manageDbClient)({
        scopes: { tenantId, projectId, agentId: agent1 },
      });
      const list2 = await listScheduledTriggers(manageDbClient)({
        scopes: { tenantId, projectId, agentId: agent2Id },
      });
      expect(list1.length).toBe(0);
      expect(list2.length).toBe(0);
    });
  });
});
