import { beforeEach, describe, expect, it } from 'vitest';
import { getDatasetRunConfigAgentRelations } from '../../../data-access/manage/evalConfig';
import type { AgentsManageDatabaseClient } from '../../../db/manage/manage-client';
import {
  agents,
  dataset,
  datasetRunConfig,
  datasetRunConfigAgentRelations,
} from '../../../db/manage/manage-schema';
import { createTestProject } from '../../../db/manage/test-manage-client';
import { generateId } from '../../../utils/conversations';
import { testManageDbClient } from '../../setup';

describe('datasetRunConfigAgentRelations scoping isolation', () => {
  const tenantId = 'test-tenant';
  let db: AgentsManageDatabaseClient;

  beforeEach(() => {
    db = testManageDbClient;
  });

  it('should scope agent relations by project when dataset run configs share the same ID', async () => {
    const project1Id = generateId();
    const project2Id = generateId();
    const sharedRunConfigId = 'shared-run-config';
    const agent1Id = generateId();
    const agent2Id = generateId();
    const dataset1Id = generateId();
    const dataset2Id = generateId();

    await createTestProject(db, tenantId, project1Id);
    await createTestProject(db, tenantId, project2Id);

    await db.insert(agents).values([
      {
        tenantId,
        projectId: project1Id,
        id: agent1Id,
        name: 'Agent 1',
        description: 'For project 1',
      },
      {
        tenantId,
        projectId: project2Id,
        id: agent2Id,
        name: 'Agent 2',
        description: 'For project 2',
      },
    ]);

    await db.insert(dataset).values([
      { tenantId, projectId: project1Id, id: dataset1Id, name: 'Dataset 1' },
      { tenantId, projectId: project2Id, id: dataset2Id, name: 'Dataset 2' },
    ]);

    await db.insert(datasetRunConfig).values([
      {
        tenantId,
        projectId: project1Id,
        id: sharedRunConfigId,
        name: 'Run Config',
        description: 'Shared',
        datasetId: dataset1Id,
      },
      {
        tenantId,
        projectId: project2Id,
        id: sharedRunConfigId,
        name: 'Run Config',
        description: 'Shared',
        datasetId: dataset2Id,
      },
    ]);

    await db.insert(datasetRunConfigAgentRelations).values([
      {
        tenantId,
        projectId: project1Id,
        id: generateId(),
        datasetRunConfigId: sharedRunConfigId,
        agentId: agent1Id,
      },
      {
        tenantId,
        projectId: project2Id,
        id: generateId(),
        datasetRunConfigId: sharedRunConfigId,
        agentId: agent2Id,
      },
    ]);

    const result1 = await getDatasetRunConfigAgentRelations(db)({
      scopes: { tenantId, projectId: project1Id, datasetRunConfigId: sharedRunConfigId },
    });
    const result2 = await getDatasetRunConfigAgentRelations(db)({
      scopes: { tenantId, projectId: project2Id, datasetRunConfigId: sharedRunConfigId },
    });

    expect(result1).toHaveLength(1);
    expect(result1[0].agentId).toBe(agent1Id);
    expect(result2).toHaveLength(1);
    expect(result2[0].agentId).toBe(agent2Id);
  });
});
