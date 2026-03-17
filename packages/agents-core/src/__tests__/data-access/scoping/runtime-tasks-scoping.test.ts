import { beforeEach, describe, expect, it } from 'vitest';
import {
  createTask,
  getTask,
  listTaskIdsByContextId,
  updateTask,
} from '../../../data-access/runtime/tasks';
import type { AgentsRunDatabaseClient } from '../../../db/runtime/runtime-client';
import { tasks } from '../../../db/runtime/runtime-schema';
import { generateId } from '../../../utils/conversations';
import { testRunDbClient } from '../../setup';

describe('runtime tasks scoping isolation', () => {
  let db: AgentsRunDatabaseClient;
  const tenantA = 'tenant-a';
  const tenantB = 'tenant-b';
  const projectA = 'project-a';
  const projectB = 'project-b';
  const testRef = { type: 'branch' as const, name: 'main', hash: 'abc123' };

  beforeEach(async () => {
    db = testRunDbClient;
    await db.delete(tasks);
  });

  it('getTask should not return a task belonging to a different tenant', async () => {
    const taskId = generateId();
    await createTask(db)({
      id: taskId,
      tenantId: tenantA,
      projectId: projectA,
      agentId: 'agent-1',
      subAgentId: 'sub-1',
      contextId: 'ctx-1',
      status: 'working',
      ref: testRef,
    });

    const result = await getTask(db)({
      id: taskId,
      scopes: { tenantId: tenantB, projectId: projectA },
    });
    expect(result).toBeNull();

    const correctResult = await getTask(db)({
      id: taskId,
      scopes: { tenantId: tenantA, projectId: projectA },
    });
    expect(correctResult).toBeDefined();
    expect(correctResult?.id).toBe(taskId);
  });

  it('getTask should not return a task belonging to a different project', async () => {
    const taskId = generateId();
    await createTask(db)({
      id: taskId,
      tenantId: tenantA,
      projectId: projectA,
      agentId: 'agent-1',
      subAgentId: 'sub-1',
      contextId: 'ctx-1',
      status: 'working',
      ref: testRef,
    });

    const result = await getTask(db)({
      id: taskId,
      scopes: { tenantId: tenantA, projectId: projectB },
    });
    expect(result).toBeNull();
  });

  it('updateTask should not update a task belonging to a different tenant', async () => {
    const taskId = generateId();
    await createTask(db)({
      id: taskId,
      tenantId: tenantA,
      projectId: projectA,
      agentId: 'agent-1',
      subAgentId: 'sub-1',
      contextId: 'ctx-1',
      status: 'working',
      ref: testRef,
    });

    const updated = await updateTask(db)({
      taskId,
      scopes: { tenantId: tenantB, projectId: projectA },
      data: { status: 'completed' },
    });
    expect(updated).toBeUndefined();

    const task = await getTask(db)({
      id: taskId,
      scopes: { tenantId: tenantA, projectId: projectA },
    });
    expect(task?.status).toBe('working');
  });

  it('listTaskIdsByContextId should only return tasks for the correct tenant/project', async () => {
    const contextId = 'shared-ctx';
    const task1Id = generateId();
    const task2Id = generateId();

    await createTask(db)({
      id: task1Id,
      tenantId: tenantA,
      projectId: projectA,
      agentId: 'agent-1',
      subAgentId: 'sub-1',
      contextId,
      status: 'working',
      ref: testRef,
    });
    await createTask(db)({
      id: task2Id,
      tenantId: tenantB,
      projectId: projectA,
      agentId: 'agent-1',
      subAgentId: 'sub-1',
      contextId,
      status: 'working',
      ref: testRef,
    });

    const result = await listTaskIdsByContextId(db)({
      contextId,
      scopes: { tenantId: tenantA, projectId: projectA },
    });
    expect(result).toEqual([task1Id]);
  });
});
