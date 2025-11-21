import { and, desc, eq } from 'drizzle-orm';
import type { DatabaseClient } from '../db/client';
import {
  dataset,
  datasetItem,
  datasetRun,
  datasetRunConfig,
  datasetRunConfigAgentRelations,
  datasetRunConfigEvaluationRunConfigRelations,
  datasetRunConversationRelations,
  evaluationJobConfig,
  evaluationJobConfigEvaluatorRelations,
  evaluationResult,
  evaluationRun,
  evaluationRunConfig,
  evaluationRunConfigEvaluationSuiteConfigRelations,
  evaluationSuiteConfig,
  evaluationSuiteConfigEvaluatorRelations,
  evaluator,
} from '../db/schema';
import type { ProjectScopeConfig } from '../types/utility';

// Type inference from schema
type DatasetInsert = typeof dataset.$inferInsert;
type DatasetSelect = typeof dataset.$inferSelect;
type DatasetUpdate = Partial<
  Omit<DatasetInsert, 'tenantId' | 'projectId' | 'id' | 'createdAt' | 'updatedAt'>
>;

type DatasetItemInsert = typeof datasetItem.$inferInsert;
export type DatasetItemSelect = typeof datasetItem.$inferSelect;
type DatasetItemUpdate = Partial<
  Omit<DatasetItemInsert, 'tenantId' | 'projectId' | 'id' | 'createdAt' | 'updatedAt'>
>;

type DatasetRunConfigInsert = typeof datasetRunConfig.$inferInsert;
type DatasetRunConfigSelect = typeof datasetRunConfig.$inferSelect;
type DatasetRunConfigUpdate = Partial<
  Omit<DatasetRunConfigInsert, 'tenantId' | 'projectId' | 'id' | 'createdAt' | 'updatedAt'>
>;

type DatasetRunConfigAgentRelationInsert = typeof datasetRunConfigAgentRelations.$inferInsert;
type DatasetRunConfigAgentRelationSelect = typeof datasetRunConfigAgentRelations.$inferSelect;

type DatasetRunConfigEvaluationRunConfigRelationInsert =
  typeof datasetRunConfigEvaluationRunConfigRelations.$inferInsert;
type DatasetRunConfigEvaluationRunConfigRelationSelect =
  typeof datasetRunConfigEvaluationRunConfigRelations.$inferSelect;

type DatasetRunInsert = typeof datasetRun.$inferInsert;
type DatasetRunSelect = typeof datasetRun.$inferSelect;
type DatasetRunUpdate = Partial<
  Omit<DatasetRunInsert, 'tenantId' | 'projectId' | 'id' | 'createdAt' | 'updatedAt'>
>;

type DatasetRunConversationRelationInsert = typeof datasetRunConversationRelations.$inferInsert;
type DatasetRunConversationRelationSelect = typeof datasetRunConversationRelations.$inferSelect;

type EvaluatorInsert = typeof evaluator.$inferInsert;
type EvaluatorSelect = typeof evaluator.$inferSelect;
type EvaluatorUpdate = Partial<
  Omit<EvaluatorInsert, 'tenantId' | 'projectId' | 'id' | 'createdAt' | 'updatedAt'>
>;

type EvaluationSuiteConfigInsert = typeof evaluationSuiteConfig.$inferInsert;
type EvaluationSuiteConfigSelect = typeof evaluationSuiteConfig.$inferSelect;
type EvaluationSuiteConfigUpdate = Partial<
  Omit<EvaluationSuiteConfigInsert, 'tenantId' | 'projectId' | 'id' | 'createdAt' | 'updatedAt'>
>;

type EvaluationRunConfigInsert = typeof evaluationRunConfig.$inferInsert;
type EvaluationRunConfigSelect = typeof evaluationRunConfig.$inferSelect;
type EvaluationRunConfigUpdate = Partial<
  Omit<EvaluationRunConfigInsert, 'tenantId' | 'projectId' | 'id' | 'createdAt' | 'updatedAt'>
>;

type EvaluationJobConfigInsert = typeof evaluationJobConfig.$inferInsert;
type EvaluationJobConfigSelect = typeof evaluationJobConfig.$inferSelect;
type EvaluationJobConfigUpdate = Partial<
  Omit<EvaluationJobConfigInsert, 'tenantId' | 'projectId' | 'id' | 'createdAt' | 'updatedAt'>
>;

type EvaluationRunInsert = typeof evaluationRun.$inferInsert;
type EvaluationRunSelect = typeof evaluationRun.$inferSelect;
type EvaluationRunUpdate = Partial<
  Omit<EvaluationRunInsert, 'tenantId' | 'projectId' | 'id' | 'createdAt' | 'updatedAt'>
>;

type EvaluationResultInsert = typeof evaluationResult.$inferInsert;
type EvaluationResultSelect = typeof evaluationResult.$inferSelect;
type EvaluationResultUpdate = Partial<
  Omit<EvaluationResultInsert, 'tenantId' | 'projectId' | 'id' | 'createdAt' | 'updatedAt'>
>;

type EvaluationSuiteConfigEvaluatorRelationInsert =
  typeof evaluationSuiteConfigEvaluatorRelations.$inferInsert;
type EvaluationSuiteConfigEvaluatorRelationSelect =
  typeof evaluationSuiteConfigEvaluatorRelations.$inferSelect;

type EvaluationRunConfigEvaluationSuiteConfigRelationInsert =
  typeof evaluationRunConfigEvaluationSuiteConfigRelations.$inferInsert;
type EvaluationRunConfigEvaluationSuiteConfigRelationSelect =
  typeof evaluationRunConfigEvaluationSuiteConfigRelations.$inferSelect;

type EvaluationJobConfigEvaluatorRelationInsert =
  typeof evaluationJobConfigEvaluatorRelations.$inferInsert;
type EvaluationJobConfigEvaluatorRelationSelect =
  typeof evaluationJobConfigEvaluatorRelations.$inferSelect;

// ============================================================================
// DATASET (CONFIG LAYER)
// ============================================================================

export const getDatasetById =
  (db: DatabaseClient) =>
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
  (db: DatabaseClient) =>
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
  (db: DatabaseClient) =>
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
  (db: DatabaseClient) =>
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
  (db: DatabaseClient) =>
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
// DATASET ITEM (CONFIG LAYER)
// ============================================================================

export const getDatasetItemById =
  (db: DatabaseClient) =>
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
  (db: DatabaseClient) =>
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
      )
      .orderBy(desc(datasetItem.updatedAt));
  };

export const createDatasetItem =
  (db: DatabaseClient) =>
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
  (db: DatabaseClient) =>
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
  (db: DatabaseClient) =>
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
  (db: DatabaseClient) =>
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
  (db: DatabaseClient) =>
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
// DATASET RUN CONFIG (CONFIG LAYER)
// ============================================================================

export const getDatasetRunConfigById =
  (db: DatabaseClient) =>
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
  (db: DatabaseClient) =>
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
  (db: DatabaseClient) =>
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
  (db: DatabaseClient) =>
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
  (db: DatabaseClient) =>
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
// DATASET RUN CONFIG AGENT RELATIONS (CONFIG LAYER - JOIN TABLE)
// ============================================================================

export const getDatasetRunConfigAgentRelations =
  (db: DatabaseClient) =>
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
  (db: DatabaseClient) =>
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
  (db: DatabaseClient) =>
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
// DATASET RUN CONFIG EVALUATION RUN CONFIG RELATIONS (CONFIG LAYER - JOIN TABLE)
// ============================================================================

export const getDatasetRunConfigEvaluationRunConfigRelations =
  (db: DatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig & { datasetRunConfigId: string };
  }): Promise<DatasetRunConfigEvaluationRunConfigRelationSelect[]> => {
    return await db
      .select()
      .from(datasetRunConfigEvaluationRunConfigRelations)
      .where(
        and(
          eq(datasetRunConfigEvaluationRunConfigRelations.tenantId, params.scopes.tenantId),
          eq(datasetRunConfigEvaluationRunConfigRelations.projectId, params.scopes.projectId),
          eq(
            datasetRunConfigEvaluationRunConfigRelations.datasetRunConfigId,
            params.scopes.datasetRunConfigId
          )
        )
      );
  };

export const createDatasetRunConfigEvaluationRunConfigRelation =
  (db: DatabaseClient) =>
  async (
    data: DatasetRunConfigEvaluationRunConfigRelationInsert
  ): Promise<DatasetRunConfigEvaluationRunConfigRelationSelect> => {
    const now = new Date().toISOString();

    const [created] = await db
      .insert(datasetRunConfigEvaluationRunConfigRelations)
      .values({
        ...data,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return created;
  };

export const updateDatasetRunConfigEvaluationRunConfigRelation =
  (db: DatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig & { datasetRunConfigId: string; evaluationRunConfigId: string };
    data: Partial<Pick<DatasetRunConfigEvaluationRunConfigRelationInsert, 'enabled'>>;
  }): Promise<DatasetRunConfigEvaluationRunConfigRelationSelect | null> => {
    const now = new Date().toISOString();

    const [updated] = await db
      .update(datasetRunConfigEvaluationRunConfigRelations)
      .set({
        ...params.data,
        updatedAt: now,
      })
      .where(
        and(
          eq(datasetRunConfigEvaluationRunConfigRelations.tenantId, params.scopes.tenantId),
          eq(datasetRunConfigEvaluationRunConfigRelations.projectId, params.scopes.projectId),
          eq(
            datasetRunConfigEvaluationRunConfigRelations.datasetRunConfigId,
            params.scopes.datasetRunConfigId
          ),
          eq(
            datasetRunConfigEvaluationRunConfigRelations.evaluationRunConfigId,
            params.scopes.evaluationRunConfigId
          )
        )
      )
      .returning();

    return updated || null;
  };

export const deleteDatasetRunConfigEvaluationRunConfigRelation =
  (db: DatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig & { datasetRunConfigId: string; evaluationRunConfigId: string };
  }): Promise<boolean> => {
    const result = await db
      .delete(datasetRunConfigEvaluationRunConfigRelations)
      .where(
        and(
          eq(datasetRunConfigEvaluationRunConfigRelations.tenantId, params.scopes.tenantId),
          eq(datasetRunConfigEvaluationRunConfigRelations.projectId, params.scopes.projectId),
          eq(
            datasetRunConfigEvaluationRunConfigRelations.datasetRunConfigId,
            params.scopes.datasetRunConfigId
          ),
          eq(
            datasetRunConfigEvaluationRunConfigRelations.evaluationRunConfigId,
            params.scopes.evaluationRunConfigId
          )
        )
      )
      .returning();

    return result.length > 0;
  };

// ============================================================================
// DATASET RUN (RUNTIME STORAGE)
// ============================================================================

export const getDatasetRunById =
  (db: DatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig & { datasetRunId: string };
  }): Promise<DatasetRunSelect | null> => {
    const results = await db
      .select()
      .from(datasetRun)
      .where(
        and(
          eq(datasetRun.tenantId, params.scopes.tenantId),
          eq(datasetRun.projectId, params.scopes.projectId),
          eq(datasetRun.id, params.scopes.datasetRunId)
        )
      )
      .limit(1);
    return results[0] ?? null;
  };

export const listDatasetRuns =
  (db: DatabaseClient) =>
  async (params: { scopes: ProjectScopeConfig }): Promise<DatasetRunSelect[]> => {
    return await db
      .select()
      .from(datasetRun)
      .where(
        and(
          eq(datasetRun.tenantId, params.scopes.tenantId),
          eq(datasetRun.projectId, params.scopes.projectId)
        )
      )
      .orderBy(desc(datasetRun.createdAt));
  };

export const listDatasetRunsByConfig =
  (db: DatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig & { datasetRunConfigId: string };
  }): Promise<DatasetRunSelect[]> => {
    return await db
      .select()
      .from(datasetRun)
      .where(
        and(
          eq(datasetRun.tenantId, params.scopes.tenantId),
          eq(datasetRun.projectId, params.scopes.projectId),
          eq(datasetRun.datasetRunConfigId, params.scopes.datasetRunConfigId)
        )
      )
      .orderBy(desc(datasetRun.createdAt));
  };

export const createDatasetRun =
  (db: DatabaseClient) =>
  async (data: DatasetRunInsert): Promise<DatasetRunSelect> => {
    const now = new Date().toISOString();

    const [created] = await db
      .insert(datasetRun)
      .values({
        ...data,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return created;
  };

export const updateDatasetRun =
  (db: DatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig & { datasetRunId: string };
    data: DatasetRunUpdate;
  }): Promise<DatasetRunSelect | null> => {
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
      .update(datasetRun)
      .set(updateData)
      .where(
        and(
          eq(datasetRun.tenantId, params.scopes.tenantId),
          eq(datasetRun.projectId, params.scopes.projectId),
          eq(datasetRun.id, params.scopes.datasetRunId)
        )
      )
      .returning();

    return updated ?? null;
  };

export const deleteDatasetRun =
  (db: DatabaseClient) =>
  async (params: { scopes: ProjectScopeConfig & { datasetRunId: string } }): Promise<boolean> => {
    const result = await db
      .delete(datasetRun)
      .where(
        and(
          eq(datasetRun.tenantId, params.scopes.tenantId),
          eq(datasetRun.projectId, params.scopes.projectId),
          eq(datasetRun.id, params.scopes.datasetRunId)
        )
      )
      .returning();

    return result.length > 0;
  };

// ============================================================================
// DATASET RUN CONVERSATION RELATIONS (RUNTIME STORAGE - JOIN TABLE)
// ============================================================================

export const getDatasetRunConversationRelations =
  (db: DatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig & { datasetRunId: string };
  }): Promise<DatasetRunConversationRelationSelect[]> => {
    return await db
      .select()
      .from(datasetRunConversationRelations)
      .where(
        and(
          eq(datasetRunConversationRelations.tenantId, params.scopes.tenantId),
          eq(datasetRunConversationRelations.projectId, params.scopes.projectId),
          eq(datasetRunConversationRelations.datasetRunId, params.scopes.datasetRunId)
        )
      );
  };

export const createDatasetRunConversationRelation =
  (db: DatabaseClient) =>
  async (
    data: DatasetRunConversationRelationInsert
  ): Promise<DatasetRunConversationRelationSelect> => {
    const now = new Date().toISOString();

    const [created] = await db
      .insert(datasetRunConversationRelations)
      .values({
        ...data,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return created;
  };

export const createDatasetRunConversationRelations =
  (db: DatabaseClient) =>
  async (
    data: DatasetRunConversationRelationInsert[]
  ): Promise<DatasetRunConversationRelationSelect[]> => {
    const now = new Date().toISOString();

    const values = data.map((item) => ({
      ...item,
      createdAt: now,
      updatedAt: now,
    }));

    const created = await db.insert(datasetRunConversationRelations).values(values).returning();

    return created;
  };

export const deleteDatasetRunConversationRelation =
  (db: DatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig & { datasetRunId: string; conversationId: string };
  }): Promise<boolean> => {
    const result = await db
      .delete(datasetRunConversationRelations)
      .where(
        and(
          eq(datasetRunConversationRelations.tenantId, params.scopes.tenantId),
          eq(datasetRunConversationRelations.projectId, params.scopes.projectId),
          eq(datasetRunConversationRelations.datasetRunId, params.scopes.datasetRunId),
          eq(datasetRunConversationRelations.conversationId, params.scopes.conversationId)
        )
      )
      .returning();

    return result.length > 0;
  };

export const deleteDatasetRunConversationRelationsByRun =
  (db: DatabaseClient) =>
  async (params: { scopes: ProjectScopeConfig & { datasetRunId: string } }): Promise<number> => {
    const result = await db
      .delete(datasetRunConversationRelations)
      .where(
        and(
          eq(datasetRunConversationRelations.tenantId, params.scopes.tenantId),
          eq(datasetRunConversationRelations.projectId, params.scopes.projectId),
          eq(datasetRunConversationRelations.datasetRunId, params.scopes.datasetRunId)
        )
      )
      .returning();

    return result.length;
  };

export const getDatasetRunConversationRelationByConversation =
  (db: DatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig & { conversationId: string };
  }): Promise<DatasetRunConversationRelationSelect | null> => {
    const results = await db
      .select()
      .from(datasetRunConversationRelations)
      .where(
        and(
          eq(datasetRunConversationRelations.tenantId, params.scopes.tenantId),
          eq(datasetRunConversationRelations.projectId, params.scopes.projectId),
          eq(datasetRunConversationRelations.conversationId, params.scopes.conversationId)
        )
      )
      .limit(1);

    return results[0] || null;
  };

// ============================================================================
// EVALUATOR (CONFIG LAYER)
// ============================================================================

export const getEvaluatorById =
  (db: DatabaseClient) =>
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
  (db: DatabaseClient) =>
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

export const createEvaluator =
  (db: DatabaseClient) =>
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
  (db: DatabaseClient) =>
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
  (db: DatabaseClient) =>
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
// EVALUATION SUITE CONFIG (CONFIG LAYER)
// ============================================================================

export const getEvaluationSuiteConfigById =
  (db: DatabaseClient) =>
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
  (db: DatabaseClient) =>
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
  (db: DatabaseClient) =>
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
  (db: DatabaseClient) =>
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
  (db: DatabaseClient) =>
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
// EVALUATION SUITE CONFIG EVALUATOR RELATIONS (CONFIG LAYER - JOIN TABLE)
// ============================================================================

export const getEvaluationSuiteConfigEvaluatorRelations =
  (db: DatabaseClient) =>
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
  (db: DatabaseClient) =>
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
  (db: DatabaseClient) =>
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
  (db: DatabaseClient) =>
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
// EVALUATION RUN CONFIG (CONFIG LAYER)
// ============================================================================

export const getEvaluationRunConfigById =
  (db: DatabaseClient) =>
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
  (db: DatabaseClient) =>
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
  (db: DatabaseClient) =>
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
  (db: DatabaseClient) =>
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
  (db: DatabaseClient) =>
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
// EVALUATION RUN CONFIG EVALUATION SUITE CONFIG RELATIONS (CONFIG LAYER - JOIN TABLE)
// ============================================================================

export const getEvaluationRunConfigEvaluationSuiteConfigRelations =
  (db: DatabaseClient) =>
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
  (db: DatabaseClient) =>
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
  (db: DatabaseClient) =>
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
// EVALUATION JOB CONFIG (CONFIG LAYER)
// ============================================================================

export const getEvaluationJobConfigById =
  (db: DatabaseClient) =>
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
  (db: DatabaseClient) =>
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

export const getEvaluationJobConfigByDatasetRunId =
  (db: DatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig;
    datasetRunId: string;
  }): Promise<EvaluationJobConfigSelect | null> => {
    const run = await db.query.datasetRun.findFirst({
      where: (datasetRun, { eq, and }) =>
        and(
          eq(datasetRun.tenantId, params.scopes.tenantId),
          eq(datasetRun.projectId, params.scopes.projectId),
          eq(datasetRun.id, params.datasetRunId)
        ),
    });

    if (!run || !run.evaluationJobConfigId) {
      return null;
    }

    const config = await db.query.evaluationJobConfig.findFirst({
      where: (evaluationJobConfig, { eq, and }) =>
        and(
          eq(evaluationJobConfig.tenantId, params.scopes.tenantId),
          eq(evaluationJobConfig.projectId, params.scopes.projectId),
          eq(evaluationJobConfig.id, run.evaluationJobConfigId!)
        ),
    });

    return config ?? null;
  };

export const createEvaluationJobConfig =
  (db: DatabaseClient) =>
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

export const updateEvaluationJobConfig =
  (db: DatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig & { evaluationJobConfigId: string };
    data: EvaluationJobConfigUpdate;
  }): Promise<EvaluationJobConfigSelect | null> => {
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
      .update(evaluationJobConfig)
      .set(updateData)
      .where(
        and(
          eq(evaluationJobConfig.tenantId, params.scopes.tenantId),
          eq(evaluationJobConfig.projectId, params.scopes.projectId),
          eq(evaluationJobConfig.id, params.scopes.evaluationJobConfigId)
        )
      )
      .returning();

    return updated ?? null;
  };

export const deleteEvaluationJobConfig =
  (db: DatabaseClient) =>
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
// EVALUATION JOB CONFIG EVALUATOR RELATIONS (CONFIG LAYER - JOIN TABLE)
// ============================================================================

export const getEvaluationJobConfigEvaluatorRelations =
  (db: DatabaseClient) =>
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
  (db: DatabaseClient) =>
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
  (db: DatabaseClient) =>
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
  (db: DatabaseClient) =>
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

// ============================================================================
// EVALUATION RUN (RUNTIME STORAGE)
// ============================================================================

export const getEvaluationRunById =
  (db: DatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig & { evaluationRunId: string };
  }): Promise<EvaluationRunSelect | null> => {
    const results = await db
      .select()
      .from(evaluationRun)
      .where(
        and(
          eq(evaluationRun.tenantId, params.scopes.tenantId),
          eq(evaluationRun.projectId, params.scopes.projectId),
          eq(evaluationRun.id, params.scopes.evaluationRunId)
        )
      )
      .limit(1);
    return results[0] ?? null;
  };

export const listEvaluationRuns =
  (db: DatabaseClient) =>
  async (params: { scopes: ProjectScopeConfig }): Promise<EvaluationRunSelect[]> => {
    return await db
      .select()
      .from(evaluationRun)
      .where(
        and(
          eq(evaluationRun.tenantId, params.scopes.tenantId),
          eq(evaluationRun.projectId, params.scopes.projectId)
        )
      );
  };

export const listEvaluationRunsByJobConfigId =
  (db: DatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig;
    evaluationJobConfigId: string;
  }): Promise<EvaluationRunSelect[]> => {
    return await db
      .select()
      .from(evaluationRun)
      .where(
        and(
          eq(evaluationRun.tenantId, params.scopes.tenantId),
          eq(evaluationRun.projectId, params.scopes.projectId),
          eq(evaluationRun.evaluationJobConfigId, params.evaluationJobConfigId)
        )
      );
  };

export const getEvaluationRunByJobConfigId =
  (db: DatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig;
    evaluationJobConfigId: string;
  }): Promise<EvaluationRunSelect | null> => {
    const runs = await db
      .select()
      .from(evaluationRun)
      .where(
        and(
          eq(evaluationRun.tenantId, params.scopes.tenantId),
          eq(evaluationRun.projectId, params.scopes.projectId),
          eq(evaluationRun.evaluationJobConfigId, params.evaluationJobConfigId)
        )
      )
      .limit(1);
    return runs[0] ?? null;
  };

export const createEvaluationRun =
  (db: DatabaseClient) =>
  async (data: EvaluationRunInsert): Promise<EvaluationRunSelect> => {
    const now = new Date().toISOString();

    const [created] = await db
      .insert(evaluationRun)
      .values({
        ...data,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return created;
  };

export const updateEvaluationRun =
  (db: DatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig & { evaluationRunId: string };
    data: EvaluationRunUpdate;
  }): Promise<EvaluationRunSelect | null> => {
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
      .update(evaluationRun)
      .set(updateData)
      .where(
        and(
          eq(evaluationRun.tenantId, params.scopes.tenantId),
          eq(evaluationRun.projectId, params.scopes.projectId),
          eq(evaluationRun.id, params.scopes.evaluationRunId)
        )
      )
      .returning();

    return updated ?? null;
  };

export const deleteEvaluationRun =
  (db: DatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig & { evaluationRunId: string };
  }): Promise<boolean> => {
    const result = await db
      .delete(evaluationRun)
      .where(
        and(
          eq(evaluationRun.tenantId, params.scopes.tenantId),
          eq(evaluationRun.projectId, params.scopes.projectId),
          eq(evaluationRun.id, params.scopes.evaluationRunId)
        )
      )
      .returning();

    return result.length > 0;
  };

// ============================================================================
// EVALUATION RESULT (RUNTIME STORAGE)
// ============================================================================

export const getEvaluationResultById =
  (db: DatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig & { evaluationResultId: string };
  }): Promise<EvaluationResultSelect | null> => {
    const result = await db.query.evaluationResult.findFirst({
      where: and(
        eq(evaluationResult.tenantId, params.scopes.tenantId),
        eq(evaluationResult.projectId, params.scopes.projectId),
        eq(evaluationResult.id, params.scopes.evaluationResultId)
      ),
    });
    return result ?? null;
  };

export const listEvaluationResults =
  (db: DatabaseClient) =>
  async (params: { scopes: ProjectScopeConfig }): Promise<EvaluationResultSelect[]> => {
    return await db.query.evaluationResult.findMany({
      where: and(
        eq(evaluationResult.tenantId, params.scopes.tenantId),
        eq(evaluationResult.projectId, params.scopes.projectId)
      ),
    });
  };

export const listEvaluationResultsByRun =
  (db: DatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig & { evaluationRunId: string };
  }): Promise<EvaluationResultSelect[]> => {
    return await db.query.evaluationResult.findMany({
      where: and(
        eq(evaluationResult.tenantId, params.scopes.tenantId),
        eq(evaluationResult.projectId, params.scopes.projectId),
        eq(evaluationResult.evaluationRunId, params.scopes.evaluationRunId)
      ),
    });
  };

export const listEvaluationResultsByConversation =
  (db: DatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig & { conversationId: string };
  }): Promise<EvaluationResultSelect[]> => {
    return await db.query.evaluationResult.findMany({
      where: and(
        eq(evaluationResult.tenantId, params.scopes.tenantId),
        eq(evaluationResult.projectId, params.scopes.projectId),
        eq(evaluationResult.conversationId, params.scopes.conversationId)
      ),
    });
  };

export const createEvaluationResult =
  (db: DatabaseClient) =>
  async (data: EvaluationResultInsert): Promise<EvaluationResultSelect> => {
    const now = new Date().toISOString();

    const [created] = await db
      .insert(evaluationResult)
      .values({
        ...data,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return created;
  };

export const createEvaluationResults =
  (db: DatabaseClient) =>
  async (data: EvaluationResultInsert[]): Promise<EvaluationResultSelect[]> => {
    const now = new Date().toISOString();

    const values = data.map((item) => ({
      ...item,
      createdAt: now,
      updatedAt: now,
    }));

    const created = await db.insert(evaluationResult).values(values).returning();

    return created;
  };

export const updateEvaluationResult =
  (db: DatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig & { evaluationResultId: string };
    data: EvaluationResultUpdate;
  }): Promise<EvaluationResultSelect | null> => {
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
      .update(evaluationResult)
      .set(updateData)
      .where(
        and(
          eq(evaluationResult.tenantId, params.scopes.tenantId),
          eq(evaluationResult.projectId, params.scopes.projectId),
          eq(evaluationResult.id, params.scopes.evaluationResultId)
        )
      )
      .returning();

    return updated ?? null;
  };

export const deleteEvaluationResult =
  (db: DatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig & { evaluationResultId: string };
  }): Promise<boolean> => {
    const result = await db
      .delete(evaluationResult)
      .where(
        and(
          eq(evaluationResult.tenantId, params.scopes.tenantId),
          eq(evaluationResult.projectId, params.scopes.projectId),
          eq(evaluationResult.id, params.scopes.evaluationResultId)
        )
      )
      .returning();

    return result.length > 0;
  };

export const deleteEvaluationResultsByRun =
  (db: DatabaseClient) =>
  async (params: { scopes: ProjectScopeConfig & { evaluationRunId: string } }): Promise<number> => {
    const result = await db
      .delete(evaluationResult)
      .where(
        and(
          eq(evaluationResult.tenantId, params.scopes.tenantId),
          eq(evaluationResult.projectId, params.scopes.projectId),
          eq(evaluationResult.evaluationRunId, params.scopes.evaluationRunId)
        )
      )
      .returning();

    return result.length;
  };
