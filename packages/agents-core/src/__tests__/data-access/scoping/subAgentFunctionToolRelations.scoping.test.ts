import { beforeEach, describe, expect, it } from 'vitest';
import { getFunctionToolsForSubAgent } from '../../../data-access/manage/functionTools';
import type { AgentsManageDatabaseClient } from '../../../db/manage/manage-client';
import {
  agents,
  functions,
  functionTools,
  subAgentFunctionToolRelations,
  subAgents,
} from '../../../db/manage/manage-schema';
import { createTestProject } from '../../../db/manage/test-manage-client';
import { generateId } from '../../../utils/conversations';
import { testManageDbClient } from '../../setup';

describe('subAgentFunctionToolRelations scoping isolation', () => {
  const tenantId = 'test-tenant';
  let projectId: string;
  let db: AgentsManageDatabaseClient;

  beforeEach(async () => {
    db = testManageDbClient;
    projectId = generateId();
    await createTestProject(db, tenantId, projectId);
  });

  it('should scope function tool relations by parent agent when subagents share the same ID', async () => {
    const sharedSubAgentId = 'shared-subagent';
    const agent1Id = generateId();
    const agent2Id = generateId();
    const fn1Id = generateId();
    const fn2Id = generateId();
    const ft1Id = generateId();
    const ft2Id = generateId();

    await db.insert(agents).values([
      {
        tenantId,
        projectId,
        id: agent1Id,
        name: 'Agent 1',
        description: 'First',
        defaultSubAgentId: sharedSubAgentId,
      },
      {
        tenantId,
        projectId,
        id: agent2Id,
        name: 'Agent 2',
        description: 'Second',
        defaultSubAgentId: sharedSubAgentId,
      },
    ]);

    await db.insert(subAgents).values([
      {
        tenantId,
        projectId,
        agentId: agent1Id,
        id: sharedSubAgentId,
        name: 'Sub',
        description: 'For agent 1',
        prompt: 'p1',
      },
      {
        tenantId,
        projectId,
        agentId: agent2Id,
        id: sharedSubAgentId,
        name: 'Sub',
        description: 'For agent 2',
        prompt: 'p2',
      },
    ]);

    await db.insert(functions).values([
      { tenantId, projectId, id: fn1Id, executeCode: 'return 1' },
      { tenantId, projectId, id: fn2Id, executeCode: 'return 2' },
    ]);

    await db.insert(functionTools).values([
      {
        tenantId,
        projectId,
        agentId: agent1Id,
        id: ft1Id,
        name: 'FnTool 1',
        description: 'For agent 1',
        functionId: fn1Id,
      },
      {
        tenantId,
        projectId,
        agentId: agent2Id,
        id: ft2Id,
        name: 'FnTool 2',
        description: 'For agent 2',
        functionId: fn2Id,
      },
    ]);

    await db.insert(subAgentFunctionToolRelations).values([
      {
        tenantId,
        projectId,
        agentId: agent1Id,
        subAgentId: sharedSubAgentId,
        id: generateId(),
        functionToolId: ft1Id,
      },
      {
        tenantId,
        projectId,
        agentId: agent2Id,
        subAgentId: sharedSubAgentId,
        id: generateId(),
        functionToolId: ft2Id,
      },
    ]);

    const result1 = await getFunctionToolsForSubAgent(db)({
      scopes: { tenantId, projectId, agentId: agent1Id },
      subAgentId: sharedSubAgentId,
    });
    const result2 = await getFunctionToolsForSubAgent(db)({
      scopes: { tenantId, projectId, agentId: agent2Id },
      subAgentId: sharedSubAgentId,
    });

    expect(result1.data).toHaveLength(1);
    expect(result1.data[0].id).toBe(ft1Id);
    expect(result2.data).toHaveLength(1);
    expect(result2.data[0].id).toBe(ft2Id);
  });
});
