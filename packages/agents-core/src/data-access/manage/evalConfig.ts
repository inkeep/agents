import { and, eq, inArray } from 'drizzle-orm';
import type { AgentsManageDatabaseClient } from '../../db/manage/manage-client';
import {
  dataset,
  datasetItem,
  datasetRunConfig,
  datasetRunConfigAgentRelations,
  evaluationJobConfig,
  evaluationJobConfigEvaluatorRelations,
  evaluationRunConfig,
  evaluationRunConfigEvaluationSuiteConfigRelations,
  evaluationSuiteConfig,
  evaluationSuiteConfigEvaluatorRelations,
  evaluator,
} from '../../db/manage/manage-schema';
import type { ProjectScopeConfig } from '../../types/utility';
import { DatasetSelect, DatasetInsert, DatasetUpdate, DatasetItemSelect, DatasetItemInsert, DatasetItemUpdate, EvaluationRunConfigSelect, EvaluationRunConfigInsert, EvaluationRunConfigUpdate, EvaluationJobConfigSelect, EvaluationJobConfigInsert, EvaluationJobConfigUpdate, EvaluationSuiteConfigSelect, EvaluationSuiteConfigInsert, EvaluationSuiteConfigUpdate, EvaluationRunConfigEvaluationSuiteConfigRelationSelect, EvaluationRunConfigEvaluationSuiteConfigRelationInsert, EvaluationRunConfigEvaluationSuiteConfigRelationUpdate, EvaluationJobConfigEvaluatorRelationSelect, EvaluationJobConfigEvaluatorRelationInsert, EvaluationJobConfigEvaluatorRelationUpdate, EvaluationSuiteConfigEvaluatorRelationSelect, EvaluationSuiteConfigEvaluatorRelationInsert, EvaluationSuiteConfigEvaluatorRelationUpdate, EvaluatorSelect, EvaluatorInsert, EvaluatorUpdate, DatasetRunConfigSelect, DatasetRunConfigInsert, DatasetRunConfigUpdate, DatasetRunConfigAgentRelationSelect, DatasetRunConfigAgentRelationInsert, DatasetRunConfigAgentRelationUpdate } from '../../types/entities';
// ============================================================================
// DATASET
// ============================================================================

export const getDatasetById =
  (db: AgentsManageDatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig & { datasetId: string };
  }): Promise<DatasetSelect | null> => {
    const results = await db
      .select()
      .from(dataset)
      .where(
        and(
          eq(dataset.tenantId, params.scopes.tenantId),
          eq(dataset.projectId, params.scopes.projectId),
          eq(dataset.id, params.scopes.datasetId)
        )
      )
      .limit(1);
    return results[0] ?? null;
  };

export const listDatasets =
  (db: AgentsManageDatabaseClient) =>
  async (params: { scopes: ProjectScopeConfig }): Promise<DatasetSelect[]> => {
    return await db
      .select()
      .from(dataset)
      .where(
        and(
          eq(dataset.tenantId, params.scopes.tenantId),
          eq(dataset.projectId, params.scopes.projectId)
        )
      );
  };

export const createDataset =
  (db: AgentsManageDatabaseClient) =>
  async (data: DatasetInsert): Promise<DatasetSelect> => {
    const now = new Date().toISOString();

    const [created] = await db
      .insert(dataset)
      .values({
        ...data,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return created;
  };

export const updateDataset =
  (db: AgentsManageDatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig & { datasetId: string };
    data: DatasetUpdate;
  }): Promise<DatasetSelect | null> => {
    const now = new Date().toISOString();

    const updateData: Record<string, unknown> = {
      updatedAt: now,
    };

    for (const [key, value] of Object.entries(params.data)) {
      if (value !== undefined) {
        updateData[key] = value;
      }
    }

    const [updated] = await db
      .update(dataset)
      .set(updateData)
      .where(
        and(
          eq(dataset.tenantId, params.scopes.tenantId),
          eq(dataset.projectId, params.scopes.projectId),
          eq(dataset.id, params.scopes.datasetId)
        )
      )
      .returning();

    return updated ?? null;
  };

export const deleteDataset =
  (db: AgentsManageDatabaseClient) =>
  async (params: { scopes: ProjectScopeConfig & { datasetId: string } }): Promise<boolean> => {
    const result = await db
      .delete(dataset)
      .where(
        and(
          eq(dataset.tenantId, params.scopes.tenantId),
          eq(dataset.projectId, params.scopes.projectId),
          eq(dataset.id, params.scopes.datasetId)
        )
      )
      .returning();

    return result.length > 0;
  };

// ============================================================================
// DATASET ITEM
// ============================================================================

export const getDatasetItemById =
  (db: AgentsManageDatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig & { datasetItemId: string };
  }): Promise<DatasetItemSelect | null> => {
    const results = await db
      .select()
      .from(datasetItem)
      .where(
        and(
          eq(datasetItem.tenantId, params.scopes.tenantId),
          eq(datasetItem.projectId, params.scopes.projectId),
          eq(datasetItem.id, params.scopes.datasetItemId)
        )
      )
      .limit(1);
    return results[0] ?? null;
  };

export const listDatasetItems =
  (db: AgentsManageDatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig & { datasetId: string };
  }): Promise<DatasetItemSelect[]> => {
    return await db
      .select()
      .from(datasetItem)
      .where(
        and(
          eq(datasetItem.tenantId, params.scopes.tenantId),
          eq(datasetItem.projectId, params.scopes.projectId),
          eq(datasetItem.datasetId, params.scopes.datasetId)
        )
      );
  };

export const createDatasetItem =
  (db: AgentsManageDatabaseClient) =>
  async (data: DatasetItemInsert): Promise<DatasetItemSelect> => {
    const now = new Date().toISOString();

    const [created] = await db
      .insert(datasetItem)
      .values({
        ...data,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return created;
  };

export const createDatasetItems =
  (db: AgentsManageDatabaseClient) =>
  async (data: DatasetItemInsert[]): Promise<DatasetItemSelect[]> => {
    const now = new Date().toISOString();

    const values = data.map((item) => ({
      ...item,
      createdAt: now,
      updatedAt: now,
    }));

    const created = await db.insert(datasetItem).values(values).returning();

    return created;
  };

export const updateDatasetItem =
  (db: AgentsManageDatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig & { datasetItemId: string };
    data: DatasetItemUpdate;
  }): Promise<DatasetItemSelect | null> => {
    const now = new Date().toISOString();

    const updateData: Record<string, unknown> = {
      updatedAt: now,
    };

    for (const [key, value] of Object.entries(params.data)) {
      if (value !== undefined) {
        updateData[key] = value;
      }
    }

    const [updated] = await db
      .update(datasetItem)
      .set(updateData)
      .where(
        and(
          eq(datasetItem.tenantId, params.scopes.tenantId),
          eq(datasetItem.projectId, params.scopes.projectId),
          eq(datasetItem.id, params.scopes.datasetItemId)
        )
      )
      .returning();

    return updated ?? null;
  };

export const deleteDatasetItem =
  (db: AgentsManageDatabaseClient) =>
  async (params: { scopes: ProjectScopeConfig & { datasetItemId: string } }): Promise<boolean> => {
    const result = await db
      .delete(datasetItem)
      .where(
        and(
          eq(datasetItem.tenantId, params.scopes.tenantId),
          eq(datasetItem.projectId, params.scopes.projectId),
          eq(datasetItem.id, params.scopes.datasetItemId)
        )
      )
      .returning();

    return result.length > 0;
  };

export const deleteDatasetItemsByDataset =
  (db: AgentsManageDatabaseClient) =>
  async (params: { scopes: ProjectScopeConfig & { datasetId: string } }): Promise<number> => {
    const result = await db
      .delete(datasetItem)
      .where(
        and(
          eq(datasetItem.tenantId, params.scopes.tenantId),
          eq(datasetItem.projectId, params.scopes.projectId),
          eq(datasetItem.datasetId, params.scopes.datasetId)
        )
      )
      .returning();

    return result.length;
  };

// ============================================================================
// DATASET RUN CONFIG
// ============================================================================

export const getDatasetRunConfigById =
  (db: AgentsManageDatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig & { datasetRunConfigId: string };
  }): Promise<DatasetRunConfigSelect | null> => {
    const results = await db
      .select()
      .from(datasetRunConfig)
      .where(
        and(
          eq(datasetRunConfig.tenantId, params.scopes.tenantId),
          eq(datasetRunConfig.projectId, params.scopes.projectId),
          eq(datasetRunConfig.id, params.scopes.datasetRunConfigId)
        )
      )
      .limit(1);
    return results[0] ?? null;
  };

export const listDatasetRunConfigs =
  (db: AgentsManageDatabaseClient) =>
  async (params: { scopes: ProjectScopeConfig }): Promise<DatasetRunConfigSelect[]> => {
    return await db
      .select()
      .from(datasetRunConfig)
      .where(
        and(
          eq(datasetRunConfig.tenantId, params.scopes.tenantId),
          eq(datasetRunConfig.projectId, params.scopes.projectId)
        )
      );
  };

export const createDatasetRunConfig =
  (db: AgentsManageDatabaseClient) =>
  async (data: DatasetRunConfigInsert): Promise<DatasetRunConfigSelect> => {
    const now = new Date().toISOString();

    const [created] = await db
      .insert(datasetRunConfig)
      .values({
        ...data,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return created;
  };

export const updateDatasetRunConfig =
  (db: AgentsManageDatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig & { datasetRunConfigId: string };
    data: DatasetRunConfigUpdate;
  }): Promise<DatasetRunConfigSelect | null> => {
    const now = new Date().toISOString();

    const updateData: Record<string, unknown> = {
      updatedAt: now,
    };

    for (const [key, value] of Object.entries(params.data)) {
      if (value !== undefined) {
        updateData[key] = value;
      }
    }

    const [updated] = await db
      .update(datasetRunConfig)
      .set(updateData)
      .where(
        and(
          eq(datasetRunConfig.tenantId, params.scopes.tenantId),
          eq(datasetRunConfig.projectId, params.scopes.projectId),
          eq(datasetRunConfig.id, params.scopes.datasetRunConfigId)
        )
      )
      .returning();

    return updated ?? null;
  };

export const deleteDatasetRunConfig =
  (db: AgentsManageDatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig & { datasetRunConfigId: string };
  }): Promise<boolean> => {
    const result = await db
      .delete(datasetRunConfig)
      .where(
        and(
          eq(datasetRunConfig.tenantId, params.scopes.tenantId),
          eq(datasetRunConfig.projectId, params.scopes.projectId),
          eq(datasetRunConfig.id, params.scopes.datasetRunConfigId)
        )
      )
      .returning();

    return result.length > 0;
  };

// ============================================================================
// DATASET RUN CONFIG AGENT RELATIONS (JOIN TABLE)
// ============================================================================

export const getDatasetRunConfigAgentRelations =
  (db: AgentsManageDatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig & { datasetRunConfigId: string };
  }): Promise<DatasetRunConfigAgentRelationSelect[]> => {
    return await db
      .select()
      .from(datasetRunConfigAgentRelations)
      .where(
        and(
          eq(datasetRunConfigAgentRelations.tenantId, params.scopes.tenantId),
          eq(datasetRunConfigAgentRelations.projectId, params.scopes.projectId),
          eq(datasetRunConfigAgentRelations.datasetRunConfigId, params.scopes.datasetRunConfigId)
        )
      );
  };

export const createDatasetRunConfigAgentRelation =
  (db: AgentsManageDatabaseClient) =>
  async (
    data: DatasetRunConfigAgentRelationInsert
  ): Promise<DatasetRunConfigAgentRelationSelect> => {
    const now = new Date().toISOString();

    const [created] = await db
      .insert(datasetRunConfigAgentRelations)
      .values({
        ...data,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return created;
  };

export const deleteDatasetRunConfigAgentRelation =
  (db: AgentsManageDatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig & { datasetRunConfigId: string; agentId: string };
  }): Promise<boolean> => {
    const result = await db
      .delete(datasetRunConfigAgentRelations)
      .where(
        and(
          eq(datasetRunConfigAgentRelations.tenantId, params.scopes.tenantId),
          eq(datasetRunConfigAgentRelations.projectId, params.scopes.projectId),
          eq(datasetRunConfigAgentRelations.datasetRunConfigId, params.scopes.datasetRunConfigId),
          eq(datasetRunConfigAgentRelations.agentId, params.scopes.agentId)
        )
      )
      .returning();

    return result.length > 0;
  };

// ============================================================================
// EVALUATOR
// ============================================================================

export const getEvaluatorById =
  (db: AgentsManageDatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig & { evaluatorId: string };
  }): Promise<EvaluatorSelect | null> => {
    const results = await db
      .select()
      .from(evaluator)
      .where(
        and(
          eq(evaluator.tenantId, params.scopes.tenantId),
          eq(evaluator.projectId, params.scopes.projectId),
          eq(evaluator.id, params.scopes.evaluatorId)
        )
      )
      .limit(1);
    return results[0] ?? null;
  };

export const listEvaluators =
  (db: AgentsManageDatabaseClient) =>
  async (params: { scopes: ProjectScopeConfig }): Promise<EvaluatorSelect[]> => {
    return await db
      .select()
      .from(evaluator)
      .where(
        and(
          eq(evaluator.tenantId, params.scopes.tenantId),
          eq(evaluator.projectId, params.scopes.projectId)
        )
      );
  };

export const getEvaluatorsByIds =
  (db: AgentsManageDatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig;
    evaluatorIds: string[];
  }): Promise<EvaluatorSelect[]> => {
    if (params.evaluatorIds.length === 0) {
      return [];
    }
    return await db
      .select()
      .from(evaluator)
      .where(
        and(
          eq(evaluator.tenantId, params.scopes.tenantId),
          eq(evaluator.projectId, params.scopes.projectId),
          inArray(evaluator.id, params.evaluatorIds)
        )
      );
  };

export const createEvaluator =
  (db: AgentsManageDatabaseClient) =>
  async (data: EvaluatorInsert): Promise<EvaluatorSelect> => {
    const now = new Date().toISOString();

    const [created] = await db
      .insert(evaluator)
      .values({
        ...data,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return created;
  };

export const updateEvaluator =
  (db: AgentsManageDatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig & { evaluatorId: string };
    data: EvaluatorUpdate;
  }): Promise<EvaluatorSelect | null> => {
    const now = new Date().toISOString();

    const updateData: Record<string, unknown> = {
      updatedAt: now,
    };

    for (const [key, value] of Object.entries(params.data)) {
      if (value !== undefined) {
        updateData[key] = value;
      }
    }

    const [updated] = await db
      .update(evaluator)
      .set(updateData)
      .where(
        and(
          eq(evaluator.tenantId, params.scopes.tenantId),
          eq(evaluator.projectId, params.scopes.projectId),
          eq(evaluator.id, params.scopes.evaluatorId)
        )
      )
      .returning();

    return updated ?? null;
  };

export const deleteEvaluator =
  (db: AgentsManageDatabaseClient) =>
  async (params: { scopes: ProjectScopeConfig & { evaluatorId: string } }): Promise<boolean> => {
    const result = await db
      .delete(evaluator)
      .where(
        and(
          eq(evaluator.tenantId, params.scopes.tenantId),
          eq(evaluator.projectId, params.scopes.projectId),
          eq(evaluator.id, params.scopes.evaluatorId)
        )
      )
      .returning();

    return result.length > 0;
  };

// ============================================================================
// EVALUATION SUITE CONFIG
// ============================================================================

export const getEvaluationSuiteConfigById =
  (db: AgentsManageDatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig & { evaluationSuiteConfigId: string };
  }): Promise<EvaluationSuiteConfigSelect | null> => {
    const results = await db
      .select()
      .from(evaluationSuiteConfig)
      .where(
        and(
          eq(evaluationSuiteConfig.tenantId, params.scopes.tenantId),
          eq(evaluationSuiteConfig.projectId, params.scopes.projectId),
          eq(evaluationSuiteConfig.id, params.scopes.evaluationSuiteConfigId)
        )
      )
      .limit(1);
    return results[0] ?? null;
  };

export const listEvaluationSuiteConfigs =
  (db: AgentsManageDatabaseClient) =>
  async (params: { scopes: ProjectScopeConfig }): Promise<EvaluationSuiteConfigSelect[]> => {
    return await db
      .select()
      .from(evaluationSuiteConfig)
      .where(
        and(
          eq(evaluationSuiteConfig.tenantId, params.scopes.tenantId),
          eq(evaluationSuiteConfig.projectId, params.scopes.projectId)
        )
      );
  };

export const createEvaluationSuiteConfig =
  (db: AgentsManageDatabaseClient) =>
  async (data: EvaluationSuiteConfigInsert): Promise<EvaluationSuiteConfigSelect> => {
    const now = new Date().toISOString();

    const [created] = await db
      .insert(evaluationSuiteConfig)
      .values({
        ...data,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return created;
  };

export const updateEvaluationSuiteConfig =
  (db: AgentsManageDatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig & { evaluationSuiteConfigId: string };
    data: EvaluationSuiteConfigUpdate;
  }): Promise<EvaluationSuiteConfigSelect | null> => {
    const now = new Date().toISOString();

    const updateData: Record<string, unknown> = {
      updatedAt: now,
    };

    for (const [key, value] of Object.entries(params.data)) {
      if (value !== undefined) {
        updateData[key] = value;
      }
    }

    const [updated] = await db
      .update(evaluationSuiteConfig)
      .set(updateData)
      .where(
        and(
          eq(evaluationSuiteConfig.tenantId, params.scopes.tenantId),
          eq(evaluationSuiteConfig.projectId, params.scopes.projectId),
          eq(evaluationSuiteConfig.id, params.scopes.evaluationSuiteConfigId)
        )
      )
      .returning();

    return updated ?? null;
  };

export const deleteEvaluationSuiteConfig =
  (db: AgentsManageDatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig & { evaluationSuiteConfigId: string };
  }): Promise<boolean> => {
    const result = await db
      .delete(evaluationSuiteConfig)
      .where(
        and(
          eq(evaluationSuiteConfig.tenantId, params.scopes.tenantId),
          eq(evaluationSuiteConfig.projectId, params.scopes.projectId),
          eq(evaluationSuiteConfig.id, params.scopes.evaluationSuiteConfigId)
        )
      )
      .returning();

    return result.length > 0;
  };

// ============================================================================
// EVALUATION SUITE CONFIG EVALUATOR RELATIONS (JOIN TABLE)
// ============================================================================

export const getEvaluationSuiteConfigEvaluatorRelations =
  (db: AgentsManageDatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig & { evaluationSuiteConfigId: string };
  }): Promise<EvaluationSuiteConfigEvaluatorRelationSelect[]> => {
    return await db
      .select()
      .from(evaluationSuiteConfigEvaluatorRelations)
      .where(
        and(
          eq(evaluationSuiteConfigEvaluatorRelations.tenantId, params.scopes.tenantId),
          eq(evaluationSuiteConfigEvaluatorRelations.projectId, params.scopes.projectId),
          eq(
            evaluationSuiteConfigEvaluatorRelations.evaluationSuiteConfigId,
            params.scopes.evaluationSuiteConfigId
          )
        )
      );
  };

export const createEvaluationSuiteConfigEvaluatorRelation =
  (db: AgentsManageDatabaseClient) =>
  async (
    data: EvaluationSuiteConfigEvaluatorRelationInsert
  ): Promise<EvaluationSuiteConfigEvaluatorRelationSelect> => {
    const now = new Date().toISOString();

    const [created] = await db
      .insert(evaluationSuiteConfigEvaluatorRelations)
      .values({
        ...data,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return created;
  };

export const deleteEvaluationSuiteConfigEvaluatorRelation =
  (db: AgentsManageDatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig & { evaluationSuiteConfigId: string; evaluatorId: string };
  }): Promise<boolean> => {
    const result = await db
      .delete(evaluationSuiteConfigEvaluatorRelations)
      .where(
        and(
          eq(evaluationSuiteConfigEvaluatorRelations.tenantId, params.scopes.tenantId),
          eq(evaluationSuiteConfigEvaluatorRelations.projectId, params.scopes.projectId),
          eq(
            evaluationSuiteConfigEvaluatorRelations.evaluationSuiteConfigId,
            params.scopes.evaluationSuiteConfigId
          ),
          eq(evaluationSuiteConfigEvaluatorRelations.evaluatorId, params.scopes.evaluatorId)
        )
      )
      .returning();

    return result.length > 0;
  };

export const deleteEvaluationSuiteConfigEvaluatorRelationsByEvaluator =
  (db: AgentsManageDatabaseClient) =>
  async (params: { scopes: ProjectScopeConfig & { evaluatorId: string } }): Promise<number> => {
    const result = await db
      .delete(evaluationSuiteConfigEvaluatorRelations)
      .where(
        and(
          eq(evaluationSuiteConfigEvaluatorRelations.tenantId, params.scopes.tenantId),
          eq(evaluationSuiteConfigEvaluatorRelations.projectId, params.scopes.projectId),
          eq(evaluationSuiteConfigEvaluatorRelations.evaluatorId, params.scopes.evaluatorId)
        )
      )
      .returning();

    return result.length;
  };

// ============================================================================
// EVALUATION RUN CONFIG
// ============================================================================

export const getEvaluationRunConfigById =
  (db: AgentsManageDatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig & { evaluationRunConfigId: string };
  }): Promise<EvaluationRunConfigSelect | null> => {
    const results = await db
      .select()
      .from(evaluationRunConfig)
      .where(
        and(
          eq(evaluationRunConfig.tenantId, params.scopes.tenantId),
          eq(evaluationRunConfig.projectId, params.scopes.projectId),
          eq(evaluationRunConfig.id, params.scopes.evaluationRunConfigId)
        )
      )
      .limit(1);
    return results[0] ?? null;
  };

export const listEvaluationRunConfigs =
  (db: AgentsManageDatabaseClient) =>
  async (params: { scopes: ProjectScopeConfig }): Promise<EvaluationRunConfigSelect[]> => {
    return await db
      .select()
      .from(evaluationRunConfig)
      .where(
        and(
          eq(evaluationRunConfig.tenantId, params.scopes.tenantId),
          eq(evaluationRunConfig.projectId, params.scopes.projectId)
        )
      );
  };

export const createEvaluationRunConfig =
  (db: AgentsManageDatabaseClient) =>
  async (data: EvaluationRunConfigInsert): Promise<EvaluationRunConfigSelect> => {
    const now = new Date().toISOString();

    const [created] = await db
      .insert(evaluationRunConfig)
      .values({
        ...data,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return created;
  };

export const updateEvaluationRunConfig =
  (db: AgentsManageDatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig & { evaluationRunConfigId: string };
    data: EvaluationRunConfigUpdate;
  }): Promise<EvaluationRunConfigSelect | null> => {
    const now = new Date().toISOString();

    const updateData: Record<string, unknown> = {
      updatedAt: now,
    };

    for (const [key, value] of Object.entries(params.data)) {
      if (value !== undefined) {
        updateData[key] = value;
      }
    }

    const [updated] = await db
      .update(evaluationRunConfig)
      .set(updateData)
      .where(
        and(
          eq(evaluationRunConfig.tenantId, params.scopes.tenantId),
          eq(evaluationRunConfig.projectId, params.scopes.projectId),
          eq(evaluationRunConfig.id, params.scopes.evaluationRunConfigId)
        )
      )
      .returning();

    return updated ?? null;
  };

export const deleteEvaluationRunConfig =
  (db: AgentsManageDatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig & { evaluationRunConfigId: string };
  }): Promise<boolean> => {
    const result = await db
      .delete(evaluationRunConfig)
      .where(
        and(
          eq(evaluationRunConfig.tenantId, params.scopes.tenantId),
          eq(evaluationRunConfig.projectId, params.scopes.projectId),
          eq(evaluationRunConfig.id, params.scopes.evaluationRunConfigId)
        )
      )
      .returning();

    return result.length > 0;
  };

// ============================================================================
// EVALUATION RUN CONFIG EVALUATION SUITE CONFIG RELATIONS (JOIN TABLE)
// ============================================================================

export const getEvaluationRunConfigEvaluationSuiteConfigRelations =
  (db: AgentsManageDatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig & { evaluationRunConfigId: string };
  }): Promise<EvaluationRunConfigEvaluationSuiteConfigRelationSelect[]> => {
    return await db
      .select()
      .from(evaluationRunConfigEvaluationSuiteConfigRelations)
      .where(
        and(
          eq(evaluationRunConfigEvaluationSuiteConfigRelations.tenantId, params.scopes.tenantId),
          eq(evaluationRunConfigEvaluationSuiteConfigRelations.projectId, params.scopes.projectId),
          eq(
            evaluationRunConfigEvaluationSuiteConfigRelations.evaluationRunConfigId,
            params.scopes.evaluationRunConfigId
          )
        )
      );
  };

export const createEvaluationRunConfigEvaluationSuiteConfigRelation =
  (db: AgentsManageDatabaseClient) =>
  async (
    data: EvaluationRunConfigEvaluationSuiteConfigRelationInsert
  ): Promise<EvaluationRunConfigEvaluationSuiteConfigRelationSelect> => {
    const now = new Date().toISOString();

    const [created] = await db
      .insert(evaluationRunConfigEvaluationSuiteConfigRelations)
      .values({
        ...data,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return created;
  };

export const deleteEvaluationRunConfigEvaluationSuiteConfigRelation =
  (db: AgentsManageDatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig & { evaluationRunConfigId: string; evaluationSuiteConfigId: string };
  }): Promise<boolean> => {
    const result = await db
      .delete(evaluationRunConfigEvaluationSuiteConfigRelations)
      .where(
        and(
          eq(evaluationRunConfigEvaluationSuiteConfigRelations.tenantId, params.scopes.tenantId),
          eq(evaluationRunConfigEvaluationSuiteConfigRelations.projectId, params.scopes.projectId),
          eq(
            evaluationRunConfigEvaluationSuiteConfigRelations.evaluationRunConfigId,
            params.scopes.evaluationRunConfigId
          ),
          eq(
            evaluationRunConfigEvaluationSuiteConfigRelations.evaluationSuiteConfigId,
            params.scopes.evaluationSuiteConfigId
          )
        )
      )
      .returning();

    return result.length > 0;
  };

// ============================================================================
// EVALUATION JOB CONFIG
// ============================================================================

export const getEvaluationJobConfigById =
  (db: AgentsManageDatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig & { evaluationJobConfigId: string };
  }): Promise<EvaluationJobConfigSelect | null> => {
    const results = await db
      .select()
      .from(evaluationJobConfig)
      .where(
        and(
          eq(evaluationJobConfig.tenantId, params.scopes.tenantId),
          eq(evaluationJobConfig.projectId, params.scopes.projectId),
          eq(evaluationJobConfig.id, params.scopes.evaluationJobConfigId)
        )
      )
      .limit(1);
    return results[0] ?? null;
  };

export const listEvaluationJobConfigs =
  (db: AgentsManageDatabaseClient) =>
  async (params: { scopes: ProjectScopeConfig }): Promise<EvaluationJobConfigSelect[]> => {
    return await db
      .select()
      .from(evaluationJobConfig)
      .where(
        and(
          eq(evaluationJobConfig.tenantId, params.scopes.tenantId),
          eq(evaluationJobConfig.projectId, params.scopes.projectId)
        )
      );
  };

export const createEvaluationJobConfig =
  (db: AgentsManageDatabaseClient) =>
  async (data: EvaluationJobConfigInsert): Promise<EvaluationJobConfigSelect> => {
    const now = new Date().toISOString();

    const [created] = await db
      .insert(evaluationJobConfig)
      .values({
        ...data,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return created;
  };

export const deleteEvaluationJobConfig =
  (db: AgentsManageDatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig & { evaluationJobConfigId: string };
  }): Promise<boolean> => {
    const result = await db
      .delete(evaluationJobConfig)
      .where(
        and(
          eq(evaluationJobConfig.tenantId, params.scopes.tenantId),
          eq(evaluationJobConfig.projectId, params.scopes.projectId),
          eq(evaluationJobConfig.id, params.scopes.evaluationJobConfigId)
        )
      )
      .returning();

    return result.length > 0;
  };

// ============================================================================
// EVALUATION JOB CONFIG EVALUATOR RELATIONS (JOIN TABLE)
// ============================================================================

export const getEvaluationJobConfigEvaluatorRelations =
  (db: AgentsManageDatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig & { evaluationJobConfigId: string };
  }): Promise<EvaluationJobConfigEvaluatorRelationSelect[]> => {
    return await db
      .select()
      .from(evaluationJobConfigEvaluatorRelations)
      .where(
        and(
          eq(evaluationJobConfigEvaluatorRelations.tenantId, params.scopes.tenantId),
          eq(evaluationJobConfigEvaluatorRelations.projectId, params.scopes.projectId),
          eq(
            evaluationJobConfigEvaluatorRelations.evaluationJobConfigId,
            params.scopes.evaluationJobConfigId
          )
        )
      );
  };

export const createEvaluationJobConfigEvaluatorRelation =
  (db: AgentsManageDatabaseClient) =>
  async (
    data: EvaluationJobConfigEvaluatorRelationInsert
  ): Promise<EvaluationJobConfigEvaluatorRelationSelect> => {
    const now = new Date().toISOString();

    const [created] = await db
      .insert(evaluationJobConfigEvaluatorRelations)
      .values({
        ...data,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return created;
  };

export const deleteEvaluationJobConfigEvaluatorRelation =
  (db: AgentsManageDatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig & { evaluationJobConfigId: string; evaluatorId: string };
  }): Promise<boolean> => {
    const result = await db
      .delete(evaluationJobConfigEvaluatorRelations)
      .where(
        and(
          eq(evaluationJobConfigEvaluatorRelations.tenantId, params.scopes.tenantId),
          eq(evaluationJobConfigEvaluatorRelations.projectId, params.scopes.projectId),
          eq(
            evaluationJobConfigEvaluatorRelations.evaluationJobConfigId,
            params.scopes.evaluationJobConfigId
          ),
          eq(evaluationJobConfigEvaluatorRelations.evaluatorId, params.scopes.evaluatorId)
        )
      )
      .returning();

    return result.length > 0;
  };

export const deleteEvaluationJobConfigEvaluatorRelationsByEvaluator =
  (db: AgentsManageDatabaseClient) =>
  async (params: { scopes: ProjectScopeConfig & { evaluatorId: string } }): Promise<number> => {
    const result = await db
      .delete(evaluationJobConfigEvaluatorRelations)
      .where(
        and(
          eq(evaluationJobConfigEvaluatorRelations.tenantId, params.scopes.tenantId),
          eq(evaluationJobConfigEvaluatorRelations.projectId, params.scopes.projectId),
          eq(evaluationJobConfigEvaluatorRelations.evaluatorId, params.scopes.evaluatorId)
        )
      )
      .returning();

    return result.length;
  };




