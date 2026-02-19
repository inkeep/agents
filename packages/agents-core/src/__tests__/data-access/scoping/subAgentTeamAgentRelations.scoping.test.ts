import { beforeEach, describe, expect, it } from 'vitest';
import { getSubAgentTeamAgentRelations } from '../../../data-access/manage/subAgentTeamAgentRelations';
import type { AgentsManageDatabaseClient } from '../../../db/manage/manage-client';
import { agents, subAgents, subAgentTeamAgentRelations } from '../../../db/manage/manage-schema';
import { createTestProject } from '../../../db/manage/test-manage-client';
import { generateId } from '../../../utils/conversations';
import { testManageDbClient } from '../../setup';

describe('subAgentTeamAgentRelations scoping isolation', () => {
  const tenantId = 'test-tenant';
  let projectId: string;
  let db: AgentsManageDatabaseClient;

  beforeEach(async () => {
    db = testManageDbClient;
    projectId = generateId();
    await createTestProject(db, tenantId, projectId);
  });

  it('should scope team agent relations by parent agent when subagents share the same ID', async () => {
    const sharedSubAgentId = 'shared-subagent';
    const agent1Id = generateId();
    const agent2Id = generateId();
    const targetAgent1Id = generateId();
    const targetAgent2Id = generateId();

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
      {
        tenantId,
        projectId,
        id: targetAgent1Id,
        name: 'Target 1',
        description: 'Target for agent 1',
      },
      {
        tenantId,
        projectId,
        id: targetAgent2Id,
        name: 'Target 2',
        description: 'Target for agent 2',
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

    await db.insert(subAgentTeamAgentRelations).values([
      {
        tenantId,
        projectId,
        agentId: agent1Id,
        subAgentId: sharedSubAgentId,
        id: generateId(),
        targetAgentId: targetAgent1Id,
      },
      {
        tenantId,
        projectId,
        agentId: agent2Id,
        subAgentId: sharedSubAgentId,
        id: generateId(),
        targetAgentId: targetAgent2Id,
      },
    ]);

    const result1 = await getSubAgentTeamAgentRelations(db)({
      scopes: { tenantId, projectId, agentId: agent1Id, subAgentId: sharedSubAgentId },
    });
    const result2 = await getSubAgentTeamAgentRelations(db)({
      scopes: { tenantId, projectId, agentId: agent2Id, subAgentId: sharedSubAgentId },
    });

    expect(result1).toHaveLength(1);
    expect(result1[0].targetAgentId).toBe(targetAgent1Id);
    expect(result2).toHaveLength(1);
    expect(result2[0].targetAgentId).toBe(targetAgent2Id);
  });
});
