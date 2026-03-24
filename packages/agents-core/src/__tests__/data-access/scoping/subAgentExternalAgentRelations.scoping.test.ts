import { beforeEach, describe, expect, it } from 'vitest';
import { getSubAgentExternalAgentRelations } from '../../../data-access/manage/subAgentExternalAgentRelations';
import type { AgentsManageDatabaseClient } from '../../../db/manage/manage-client';
import {
  agents,
  externalAgents,
  subAgentExternalAgentRelations,
  subAgents,
} from '../../../db/manage/manage-schema';
import { createTestProject } from '../../../db/manage/test-manage-client';
import { generateId } from '../../../utils/conversations';
import { testManageDbClient } from '../../setup';

describe('subAgentExternalAgentRelations scoping isolation', () => {
  const tenantId = 'test-tenant';
  let projectId: string;
  let db: AgentsManageDatabaseClient;

  beforeEach(async () => {
    db = testManageDbClient;
    projectId = generateId();
    await createTestProject(db, tenantId, projectId);
  });

  it('should scope external agent relations by parent agent when subagents share the same ID', async () => {
    const sharedSubAgentId = 'shared-subagent';
    const agent1Id = generateId();
    const agent2Id = generateId();
    const ext1Id = generateId();
    const ext2Id = generateId();

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

    await db.insert(externalAgents).values([
      {
        tenantId,
        projectId,
        id: ext1Id,
        name: 'External 1',
        description: 'For agent 1',
        baseUrl: 'http://ext1.test',
      },
      {
        tenantId,
        projectId,
        id: ext2Id,
        name: 'External 2',
        description: 'For agent 2',
        baseUrl: 'http://ext2.test',
      },
    ]);

    await db.insert(subAgentExternalAgentRelations).values([
      {
        tenantId,
        projectId,
        agentId: agent1Id,
        subAgentId: sharedSubAgentId,
        id: generateId(),
        externalAgentId: ext1Id,
      },
      {
        tenantId,
        projectId,
        agentId: agent2Id,
        subAgentId: sharedSubAgentId,
        id: generateId(),
        externalAgentId: ext2Id,
      },
    ]);

    const result1 = await getSubAgentExternalAgentRelations(db)({
      scopes: { tenantId, projectId, agentId: agent1Id, subAgentId: sharedSubAgentId },
    });
    const result2 = await getSubAgentExternalAgentRelations(db)({
      scopes: { tenantId, projectId, agentId: agent2Id, subAgentId: sharedSubAgentId },
    });

    expect(result1).toHaveLength(1);
    expect(result1[0].externalAgentId).toBe(ext1Id);
    expect(result2).toHaveLength(1);
    expect(result2[0].externalAgentId).toBe(ext2Id);
  });
});
