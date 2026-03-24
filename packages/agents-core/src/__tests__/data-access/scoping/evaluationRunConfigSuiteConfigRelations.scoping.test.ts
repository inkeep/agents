import { beforeEach, describe, expect, it } from 'vitest';
import { getEvaluationRunConfigEvaluationSuiteConfigRelations } from '../../../data-access/manage/evalConfig';
import type { AgentsManageDatabaseClient } from '../../../db/manage/manage-client';
import {
  evaluationRunConfig,
  evaluationRunConfigEvaluationSuiteConfigRelations,
  evaluationSuiteConfig,
} from '../../../db/manage/manage-schema';
import { createTestProject } from '../../../db/manage/test-manage-client';
import { generateId } from '../../../utils/conversations';
import { testManageDbClient } from '../../setup';

describe('evaluationRunConfigEvaluationSuiteConfigRelations scoping isolation', () => {
  const tenantId = 'test-tenant';
  let db: AgentsManageDatabaseClient;

  beforeEach(() => {
    db = testManageDbClient;
  });

  it('should scope suite config relations by project when run configs share the same ID', async () => {
    const project1Id = generateId();
    const project2Id = generateId();
    const sharedRunConfigId = 'shared-run-config';
    const suiteConfig1Id = generateId();
    const suiteConfig2Id = generateId();

    await createTestProject(db, tenantId, project1Id);
    await createTestProject(db, tenantId, project2Id);

    await db.insert(evaluationRunConfig).values([
      {
        tenantId,
        projectId: project1Id,
        id: sharedRunConfigId,
        name: 'Run Config',
        description: 'Shared',
      },
      {
        tenantId,
        projectId: project2Id,
        id: sharedRunConfigId,
        name: 'Run Config',
        description: 'Shared',
      },
    ]);

    await db.insert(evaluationSuiteConfig).values([
      { tenantId, projectId: project1Id, id: suiteConfig1Id },
      { tenantId, projectId: project2Id, id: suiteConfig2Id },
    ]);

    await db.insert(evaluationRunConfigEvaluationSuiteConfigRelations).values([
      {
        tenantId,
        projectId: project1Id,
        id: generateId(),
        evaluationRunConfigId: sharedRunConfigId,
        evaluationSuiteConfigId: suiteConfig1Id,
      },
      {
        tenantId,
        projectId: project2Id,
        id: generateId(),
        evaluationRunConfigId: sharedRunConfigId,
        evaluationSuiteConfigId: suiteConfig2Id,
      },
    ]);

    const result1 = await getEvaluationRunConfigEvaluationSuiteConfigRelations(db)({
      scopes: { tenantId, projectId: project1Id, evaluationRunConfigId: sharedRunConfigId },
    });
    const result2 = await getEvaluationRunConfigEvaluationSuiteConfigRelations(db)({
      scopes: { tenantId, projectId: project2Id, evaluationRunConfigId: sharedRunConfigId },
    });

    expect(result1).toHaveLength(1);
    expect(result1[0].evaluationSuiteConfigId).toBe(suiteConfig1Id);
    expect(result2).toHaveLength(1);
    expect(result2[0].evaluationSuiteConfigId).toBe(suiteConfig2Id);
  });
});
