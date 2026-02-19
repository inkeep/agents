import { beforeEach, describe, expect, it } from 'vitest';
import { getSkillsForSubAgents } from '../../../data-access/manage/skills';
import type { AgentsManageDatabaseClient } from '../../../db/manage/manage-client';
import { agents, skills, subAgentSkills, subAgents } from '../../../db/manage/manage-schema';
import { createTestProject } from '../../../db/manage/test-manage-client';
import { generateId } from '../../../utils/conversations';
import { testManageDbClient } from '../../setup';

describe('subAgentSkills scoping isolation', () => {
  const tenantId = 'test-tenant';
  let projectId: string;
  let db: AgentsManageDatabaseClient;

  beforeEach(async () => {
    db = testManageDbClient;
    projectId = generateId();
    await createTestProject(db, tenantId, projectId);
  });

  it('should scope skills by parent agent when subagents share the same ID', async () => {
    const sharedSubAgentId = 'shared-subagent';
    const agent1Id = generateId();
    const agent2Id = generateId();
    const skill1Id = generateId();
    const skill2Id = generateId();

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

    await db.insert(skills).values([
      {
        tenantId,
        projectId,
        id: skill1Id,
        name: 'Skill 1',
        description: 'For agent 1',
        content: 'content1',
      },
      {
        tenantId,
        projectId,
        id: skill2Id,
        name: 'Skill 2',
        description: 'For agent 2',
        content: 'content2',
      },
    ]);

    await db.insert(subAgentSkills).values([
      {
        tenantId,
        projectId,
        agentId: agent1Id,
        subAgentId: sharedSubAgentId,
        id: generateId(),
        skillId: skill1Id,
        index: 0,
      },
      {
        tenantId,
        projectId,
        agentId: agent2Id,
        subAgentId: sharedSubAgentId,
        id: generateId(),
        skillId: skill2Id,
        index: 0,
      },
    ]);

    const result1 = await getSkillsForSubAgents(db)({
      scopes: { tenantId, projectId, agentId: agent1Id },
      subAgentIds: [sharedSubAgentId],
    });
    const result2 = await getSkillsForSubAgents(db)({
      scopes: { tenantId, projectId, agentId: agent2Id },
      subAgentIds: [sharedSubAgentId],
    });

    const skills1 = result1.filter((s) => s.subAgentId === sharedSubAgentId);
    const skills2 = result2.filter((s) => s.subAgentId === sharedSubAgentId);

    expect(skills1).toHaveLength(1);
    expect(skills1[0].id).toBe(skill1Id);
    expect(skills2).toHaveLength(1);
    expect(skills2[0].id).toBe(skill2Id);
  });
});
