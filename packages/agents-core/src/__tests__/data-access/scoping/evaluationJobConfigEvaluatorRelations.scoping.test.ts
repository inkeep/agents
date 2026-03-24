import { beforeEach, describe, expect, it } from 'vitest';
import { getEvaluationJobConfigEvaluatorRelations } from '../../../data-access/manage/evalConfig';
import type { AgentsManageDatabaseClient } from '../../../db/manage/manage-client';
import {
  evaluationJobConfig,
  evaluationJobConfigEvaluatorRelations,
  evaluator,
} from '../../../db/manage/manage-schema';
import { createTestProject } from '../../../db/manage/test-manage-client';
import { generateId } from '../../../utils/conversations';
import { testManageDbClient } from '../../setup';

describe('evaluationJobConfigEvaluatorRelations scoping isolation', () => {
  const tenantId = 'test-tenant';
  let db: AgentsManageDatabaseClient;

  beforeEach(() => {
    db = testManageDbClient;
  });

  it('should scope evaluator relations by project when job configs share the same ID', async () => {
    const project1Id = generateId();
    const project2Id = generateId();
    const sharedJobConfigId = 'shared-job-config';
    const evaluator1Id = generateId();
    const evaluator2Id = generateId();

    await createTestProject(db, tenantId, project1Id);
    await createTestProject(db, tenantId, project2Id);

    await db.insert(evaluator).values([
      {
        tenantId,
        projectId: project1Id,
        id: evaluator1Id,
        name: 'Evaluator 1',
        description: 'For project 1',
        prompt: 'evaluate',
        schema: {},
        model: { model: 'test-model' },
      },
      {
        tenantId,
        projectId: project2Id,
        id: evaluator2Id,
        name: 'Evaluator 2',
        description: 'For project 2',
        prompt: 'evaluate',
        schema: {},
        model: { model: 'test-model' },
      },
    ]);

    await db.insert(evaluationJobConfig).values([
      { tenantId, projectId: project1Id, id: sharedJobConfigId },
      { tenantId, projectId: project2Id, id: sharedJobConfigId },
    ]);

    await db.insert(evaluationJobConfigEvaluatorRelations).values([
      {
        tenantId,
        projectId: project1Id,
        id: generateId(),
        evaluationJobConfigId: sharedJobConfigId,
        evaluatorId: evaluator1Id,
      },
      {
        tenantId,
        projectId: project2Id,
        id: generateId(),
        evaluationJobConfigId: sharedJobConfigId,
        evaluatorId: evaluator2Id,
      },
    ]);

    const result1 = await getEvaluationJobConfigEvaluatorRelations(db)({
      scopes: { tenantId, projectId: project1Id, evaluationJobConfigId: sharedJobConfigId },
    });
    const result2 = await getEvaluationJobConfigEvaluatorRelations(db)({
      scopes: { tenantId, projectId: project2Id, evaluationJobConfigId: sharedJobConfigId },
    });

    expect(result1).toHaveLength(1);
    expect(result1[0].evaluatorId).toBe(evaluator1Id);
    expect(result2).toHaveLength(1);
    expect(result2[0].evaluatorId).toBe(evaluator2Id);
  });
});
