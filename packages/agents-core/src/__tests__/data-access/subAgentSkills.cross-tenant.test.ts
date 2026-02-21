import { beforeEach, describe, expect, it } from 'vitest';
import type { AgentsManageDatabaseClient } from '../../db/manage/manage-client';
import { agents, skills, subAgentSkills, subAgents } from '../../db/manage/manage-schema';
import { createTestProject } from '../../db/manage/test-manage-client';
import { generateId } from '../../utils/conversations';
import { testManageDbClient } from '../setup';

describe('subAgentSkills - cross-tenant isolation', () => {
  let db: AgentsManageDatabaseClient;

  beforeEach(() => {
    db = testManageDbClient;
  });

  it('should allow different tenants to use the same sub_agent_id + skill_id combination', async () => {
    const tenant1 = 'tenant-1';
    const tenant2 = 'tenant-2';
    const sharedSubAgentId = 'shared-subagent';
    const sharedSkillId = 'shared-skill';

    const project1Id = generateId();
    const project2Id = generateId();
    const agent1Id = generateId();
    const agent2Id = generateId();

    await createTestProject(db, tenant1, project1Id);
    await createTestProject(db, tenant2, project2Id);

    await db.insert(agents).values([
      {
        tenantId: tenant1,
        projectId: project1Id,
        id: agent1Id,
        name: 'Agent 1',
        description: 'Tenant 1 agent',
        defaultSubAgentId: sharedSubAgentId,
      },
      {
        tenantId: tenant2,
        projectId: project2Id,
        id: agent2Id,
        name: 'Agent 2',
        description: 'Tenant 2 agent',
        defaultSubAgentId: sharedSubAgentId,
      },
    ]);

    await db.insert(subAgents).values([
      {
        tenantId: tenant1,
        projectId: project1Id,
        agentId: agent1Id,
        id: sharedSubAgentId,
        name: 'Shared SubAgent',
        description: 'Belongs to tenant 1',
        prompt: '',
      },
      {
        tenantId: tenant2,
        projectId: project2Id,
        agentId: agent2Id,
        id: sharedSubAgentId,
        name: 'Shared SubAgent',
        description: 'Belongs to tenant 2',
        prompt: '',
      },
    ]);

    await db.insert(skills).values([
      {
        tenantId: tenant1,
        projectId: project1Id,
        id: sharedSkillId,
        name: sharedSkillId,
        description: 'Shared skill',
        content: 'skill content',
      },
      {
        tenantId: tenant2,
        projectId: project2Id,
        id: sharedSkillId,
        name: sharedSkillId,
        description: 'Shared skill',
        content: 'skill content',
      },
    ]);

    await db.insert(subAgentSkills).values({
      tenantId: tenant1,
      projectId: project1Id,
      agentId: agent1Id,
      subAgentId: sharedSubAgentId,
      skillId: sharedSkillId,
      id: generateId(),
      index: 0,
      alwaysLoaded: false,
    });

    await expect(
      db.insert(subAgentSkills).values({
        tenantId: tenant2,
        projectId: project2Id,
        agentId: agent2Id,
        subAgentId: sharedSubAgentId,
        skillId: sharedSkillId,
        id: generateId(),
        index: 0,
        alwaysLoaded: false,
      })
    ).resolves.not.toThrow();
  });

  it('should still prevent duplicate skill assignment within the same tenant/project/agent/subagent', async () => {
    const tenantId = 'tenant-dup';
    const projectId = generateId();
    const agentId = generateId();
    const subAgentId = 'test-subagent';
    const skillId = 'test-skill';

    await createTestProject(db, tenantId, projectId);

    await db.insert(agents).values({
      tenantId,
      projectId,
      id: agentId,
      name: 'Test Agent',
      description: 'Test',
      defaultSubAgentId: subAgentId,
    });

    await db.insert(subAgents).values({
      tenantId,
      projectId,
      agentId,
      id: subAgentId,
      name: 'Test SubAgent',
      description: 'Test',
      prompt: '',
    });

    await db.insert(skills).values({
      tenantId,
      projectId,
      id: skillId,
      name: skillId,
      description: 'Test skill',
      content: 'content',
    });

    await db.insert(subAgentSkills).values({
      tenantId,
      projectId,
      agentId,
      subAgentId,
      skillId,
      id: generateId(),
      index: 0,
      alwaysLoaded: false,
    });

    await expect(
      db.insert(subAgentSkills).values({
        tenantId,
        projectId,
        agentId,
        subAgentId,
        skillId,
        id: generateId(),
        index: 1,
        alwaysLoaded: false,
      })
    ).rejects.toThrow();
  });
});
