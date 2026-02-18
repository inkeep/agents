import type { JsonSchemaForLlmSchemaType } from '@inkeep/agents-core';
import { beforeEach, describe, expect, it } from 'vitest';
import { getFullAgentDefinition } from '../../data-access/manage/agents';
import type { AgentsManageDatabaseClient } from '../../db/manage/manage-client';
import {
  agents,
  artifactComponents,
  dataComponents,
  subAgentArtifactComponents,
  subAgentDataComponents,
  subAgents,
} from '../../db/manage/manage-schema';
import { createTestProject } from '../../db/manage/test-manage-client';
import { generateId } from '../../utils/conversations';
import { testManageDbClient } from '../setup';

describe('getFullAgentDefinition - component scoping (duplicate subagent IDs)', () => {
  const tenantId = 'test-tenant';
  let projectId: string;
  let db: AgentsManageDatabaseClient;

  beforeEach(async () => {
    db = testManageDbClient;
    projectId = generateId();
    await createTestProject(db, tenantId, projectId);
  });

  it('should scope data and artifact components by parent agent when subagents share the same ID', async () => {
    const sharedSubAgentId = 'shared-subagent';
    const agent1Id = generateId();
    const agent2Id = generateId();
    const dc1Id = generateId();
    const dc2Id = generateId();
    const ac1Id = generateId();
    const ac2Id = generateId();

    await db.insert(agents).values([
      {
        tenantId,
        projectId,
        id: agent1Id,
        name: 'Agent 1',
        description: 'First agent',
        defaultSubAgentId: sharedSubAgentId,
      },
      {
        tenantId,
        projectId,
        id: agent2Id,
        name: 'Agent 2',
        description: 'Second agent',
        defaultSubAgentId: sharedSubAgentId,
      },
    ]);

    await db.insert(subAgents).values([
      {
        tenantId,
        projectId,
        agentId: agent1Id,
        id: sharedSubAgentId,
        name: 'Shared SubAgent',
        description: 'Belongs to agent 1',
        prompt: 'You are agent 1',
      },
      {
        tenantId,
        projectId,
        agentId: agent2Id,
        id: sharedSubAgentId,
        name: 'Shared SubAgent',
        description: 'Belongs to agent 2',
        prompt: 'You are agent 2',
      },
    ]);

    await db.insert(dataComponents).values([
      {
        tenantId,
        projectId,
        id: dc1Id,
        name: 'Data Component 1',
        description: 'For agent 1',
        props: {} as JsonSchemaForLlmSchemaType,
      },
      {
        tenantId,
        projectId,
        id: dc2Id,
        name: 'Data Component 2',
        description: 'For agent 2',
        props: {} as JsonSchemaForLlmSchemaType,
      },
    ]);

    await db.insert(artifactComponents).values([
      {
        tenantId,
        projectId,
        id: ac1Id,
        name: 'Artifact Component 1',
        description: 'For agent 1',
        props: {} as JsonSchemaForLlmSchemaType,
      },
      {
        tenantId,
        projectId,
        id: ac2Id,
        name: 'Artifact Component 2',
        description: 'For agent 2',
        props: {} as JsonSchemaForLlmSchemaType,
      },
    ]);

    await db.insert(subAgentDataComponents).values([
      {
        tenantId,
        projectId,
        agentId: agent1Id,
        id: generateId(),
        subAgentId: sharedSubAgentId,
        dataComponentId: dc1Id,
      },
      {
        tenantId,
        projectId,
        agentId: agent2Id,
        id: generateId(),
        subAgentId: sharedSubAgentId,
        dataComponentId: dc2Id,
      },
    ]);

    await db.insert(subAgentArtifactComponents).values([
      {
        tenantId,
        projectId,
        agentId: agent1Id,
        id: generateId(),
        subAgentId: sharedSubAgentId,
        artifactComponentId: ac1Id,
      },
      {
        tenantId,
        projectId,
        agentId: agent2Id,
        id: generateId(),
        subAgentId: sharedSubAgentId,
        artifactComponentId: ac2Id,
      },
    ]);

    const result1 = await getFullAgentDefinition(db)({
      scopes: { tenantId, projectId, agentId: agent1Id },
    });
    const result2 = await getFullAgentDefinition(db)({
      scopes: { tenantId, projectId, agentId: agent2Id },
    });

    expect(result1).toBeDefined();
    expect(result2).toBeDefined();

    const subAgent1 = result1?.subAgents[sharedSubAgentId];
    const subAgent2 = result2?.subAgents[sharedSubAgentId];

    expect(subAgent1?.dataComponents).toEqual([dc1Id]);
    expect(subAgent1?.artifactComponents).toEqual([ac1Id]);
    expect(subAgent2?.dataComponents).toEqual([dc2Id]);
    expect(subAgent2?.artifactComponents).toEqual([ac2Id]);
  });
});
