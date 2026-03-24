import { beforeEach, describe, expect, it } from 'vitest';
import { getAgentToolRelationByAgent } from '../../../data-access/manage/subAgentRelations';
import type { AgentsManageDatabaseClient } from '../../../db/manage/manage-client';
import { agents, subAgents, subAgentToolRelations, tools } from '../../../db/manage/manage-schema';
import { createTestProject } from '../../../db/manage/test-manage-client';
import { generateId } from '../../../utils/conversations';
import { testManageDbClient } from '../../setup';

describe('subAgentToolRelations scoping isolation', () => {
  const tenantId = 'test-tenant';
  let projectId: string;
  let db: AgentsManageDatabaseClient;

  beforeEach(async () => {
    db = testManageDbClient;
    projectId = generateId();
    await createTestProject(db, tenantId, projectId);
  });

  it('should scope tool relations by parent agent when subagents share the same ID', async () => {
    const sharedSubAgentId = 'shared-subagent';
    const agent1Id = generateId();
    const agent2Id = generateId();
    const tool1Id = generateId();
    const tool2Id = generateId();

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

    await db.insert(tools).values([
      {
        tenantId,
        projectId,
        id: tool1Id,
        name: 'Tool 1',
        description: 'For agent 1',
        config: { type: 'mcp' as const, mcp: { server: { url: 'http://tool1.test' } } },
      },
      {
        tenantId,
        projectId,
        id: tool2Id,
        name: 'Tool 2',
        description: 'For agent 2',
        config: { type: 'mcp' as const, mcp: { server: { url: 'http://tool2.test' } } },
      },
    ]);

    await db.insert(subAgentToolRelations).values([
      {
        tenantId,
        projectId,
        agentId: agent1Id,
        subAgentId: sharedSubAgentId,
        id: generateId(),
        toolId: tool1Id,
      },
      {
        tenantId,
        projectId,
        agentId: agent2Id,
        subAgentId: sharedSubAgentId,
        id: generateId(),
        toolId: tool2Id,
      },
    ]);

    const result1 = await getAgentToolRelationByAgent(db)({
      scopes: { tenantId, projectId, agentId: agent1Id, subAgentId: sharedSubAgentId },
    });
    const result2 = await getAgentToolRelationByAgent(db)({
      scopes: { tenantId, projectId, agentId: agent2Id, subAgentId: sharedSubAgentId },
    });

    expect(result1.data).toHaveLength(1);
    expect(result1.data[0].toolId).toBe(tool1Id);
    expect(result2.data).toHaveLength(1);
    expect(result2.data[0].toolId).toBe(tool2Id);
  });
});
