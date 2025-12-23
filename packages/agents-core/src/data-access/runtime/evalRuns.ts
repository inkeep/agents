import { and, desc, eq } from 'drizzle-orm';
import type { AgentsRunDatabaseClient } from '../../db/runtime/runtime-client';
import {
  datasetRun,
  datasetRunConversationRelations,
  evaluationResult,
  evaluationRun,
} from '../../db/runtime/runtime-schema';
import type { ProjectScopeConfig } from '../../types/utility';
import { DatasetRunSelect, DatasetRunInsert, DatasetRunConversationRelationSelect, DatasetRunConversationRelationInsert, EvaluationResultSelect, EvaluationResultInsert, EvaluationResultUpdate, EvaluationRunSelect, EvaluationRunInsert, EvaluationRunUpdate } from '../../types/entities';



// ============================================================================
// DATASET RUN
// ============================================================================

export const getDatasetRunById =
  (db: AgentsRunDatabaseClient) =>
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
  (db: AgentsRunDatabaseClient) =>
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
  (db: AgentsRunDatabaseClient) =>
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
  (db: AgentsRunDatabaseClient) =>
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

export const deleteDatasetRun =
  (db: AgentsRunDatabaseClient) =>
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
// DATASET RUN CONVERSATION RELATIONS (JOIN TABLE)
// ============================================================================

export const getDatasetRunConversationRelations =
  (db: AgentsRunDatabaseClient) =>
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
  (db: AgentsRunDatabaseClient) =>
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
  (db: AgentsRunDatabaseClient) =>
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
  (db: AgentsRunDatabaseClient) =>
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
  (db: AgentsRunDatabaseClient) =>
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
  (db: AgentsRunDatabaseClient) =>
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
// EVALUATION RUN
// ============================================================================

export const getEvaluationRunById =
  (db: AgentsRunDatabaseClient) =>
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
  (db: AgentsRunDatabaseClient) =>
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
  (db: AgentsRunDatabaseClient) =>
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
  (db: AgentsRunDatabaseClient) =>
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
  (db: AgentsRunDatabaseClient) =>
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
  (db: AgentsRunDatabaseClient) =>
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
  (db: AgentsRunDatabaseClient) =>
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
// EVALUATION RESULT
// ============================================================================

export const getEvaluationResultById =
  (db: AgentsRunDatabaseClient) =>
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
  (db: AgentsRunDatabaseClient) =>
  async (params: { scopes: ProjectScopeConfig }): Promise<EvaluationResultSelect[]> => {
    return await db.query.evaluationResult.findMany({
      where: and(
        eq(evaluationResult.tenantId, params.scopes.tenantId),
        eq(evaluationResult.projectId, params.scopes.projectId)
      ),
    });
  };

export const listEvaluationResultsByRun =
  (db: AgentsRunDatabaseClient) =>
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
  (db: AgentsRunDatabaseClient) =>
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
  (db: AgentsRunDatabaseClient) =>
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
  (db: AgentsRunDatabaseClient) =>
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
  (db: AgentsRunDatabaseClient) =>
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
  (db: AgentsRunDatabaseClient) =>
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
  (db: AgentsRunDatabaseClient) =>
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

