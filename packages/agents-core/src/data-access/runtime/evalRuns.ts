import { and, asc, count, desc, eq, gte, inArray, lte, type SQL, sql } from 'drizzle-orm';
import type { AgentsRunDatabaseClient } from '../../db/runtime/runtime-client';
import {
  conversations,
  datasetRun,
  datasetRunConversationRelations,
  evaluationResult,
  evaluationRun,
  messages,
} from '../../db/runtime/runtime-schema';
import type {
  ConversationSelect,
  DatasetRunConversationRelationInsert,
  DatasetRunConversationRelationSelect,
  DatasetRunInsert,
  DatasetRunSelect,
  EvaluationResultInsert,
  EvaluationResultSelect,
  EvaluationResultUpdate,
  EvaluationRunInsert,
  EvaluationRunSelect,
  EvaluationRunUpdate,
} from '../../types/entities';
import type {
  EvaluationJobFilterCriteria,
  Filter,
  MessageContent,
  ProjectScopeConfig,
} from '../../types/utility';
import { projectScopedWhere } from '../manage/scope-helpers';

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
          projectScopedWhere(datasetRun, params.scopes),
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
      .where(projectScopedWhere(datasetRun, params.scopes))
      .orderBy(desc(datasetRun.createdAt));
  };

export const getDatasetRunsByIds =
  (db: AgentsRunDatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig;
    datasetRunIds: string[];
  }): Promise<DatasetRunSelect[]> => {
    if (params.datasetRunIds.length === 0) return [];
    return await db
      .select()
      .from(datasetRun)
      .where(
        and(
          projectScopedWhere(datasetRun, params.scopes),
          inArray(datasetRun.id, params.datasetRunIds)
        )
      );
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
          projectScopedWhere(datasetRun, params.scopes),
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
          projectScopedWhere(datasetRun, params.scopes),
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
          projectScopedWhere(datasetRunConversationRelations, params.scopes),
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
          projectScopedWhere(datasetRunConversationRelations, params.scopes),
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
          projectScopedWhere(datasetRunConversationRelations, params.scopes),
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
          projectScopedWhere(datasetRunConversationRelations, params.scopes),
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
          projectScopedWhere(evaluationRun, params.scopes),
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
      .where(projectScopedWhere(evaluationRun, params.scopes));
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
          projectScopedWhere(evaluationRun, params.scopes),
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
          projectScopedWhere(evaluationRun, params.scopes),
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
          projectScopedWhere(evaluationRun, params.scopes),
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
          projectScopedWhere(evaluationRun, params.scopes),
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
        projectScopedWhere(evaluationResult, params.scopes),
        eq(evaluationResult.id, params.scopes.evaluationResultId)
      ),
    });
    return result ?? null;
  };

export const listEvaluationResults =
  (db: AgentsRunDatabaseClient) =>
  async (params: { scopes: ProjectScopeConfig }): Promise<EvaluationResultSelect[]> => {
    return await db.query.evaluationResult.findMany({
      where: projectScopedWhere(evaluationResult, params.scopes),
    });
  };

export const listEvaluationResultsByRun =
  (db: AgentsRunDatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig & { evaluationRunId: string };
  }): Promise<EvaluationResultSelect[]> => {
    return await db.query.evaluationResult.findMany({
      where: and(
        projectScopedWhere(evaluationResult, params.scopes),
        eq(evaluationResult.evaluationRunId, params.scopes.evaluationRunId)
      ),
    });
  };

const EVAL_RESULTS_MAX_ROWS = 20_000;

// ---------------------------------------------------------------------------
// Server-side paginated + filtered evaluation results
// ---------------------------------------------------------------------------

export interface EvalResultsFilter {
  evaluatorId?: string;
  agentId?: string;
  conversationId?: string;
  /** ISO timestamp — only include results whose conversation was created on or after this instant. */
  startDate?: string;
  /** ISO timestamp — only include results whose conversation was created on or before this instant. */
  endDate?: string;
}

export interface EvalResultsPagination {
  page: number;
  limit: number;
}

export interface EnrichedEvaluationResult {
  id: string;
  tenantId: string;
  projectId: string;
  conversationId: string;
  evaluatorId: string;
  evaluationRunId: string | null;
  output: MessageContent | null;
  createdAt: string;
  updatedAt: string;
  input: string | null;
  agentId: string | null;
  conversationCreatedAt: string | null;
}

export interface PaginatedEvalResults {
  data: EnrichedEvaluationResult[];
  pagination: { page: number; limit: number; total: number; pages: number; completedCount: number };
  distinctAgentIds: string[];
  distinctOutputKeys: string[];
}

function buildFirstUserMessageSubquery(db: AgentsRunDatabaseClient) {
  return db
    .selectDistinctOn([messages.conversationId], {
      conversationId: messages.conversationId,
      content: messages.content,
    })
    .from(messages)
    .where(eq(messages.role, 'user'))
    .orderBy(messages.conversationId, asc(messages.createdAt), asc(messages.id))
    .as('first_msg');
}

function buildEvalResultsBaseQuery(
  db: AgentsRunDatabaseClient,
  params: {
    scopes: ProjectScopeConfig;
    evaluationRunConfigId?: string;
    evaluationJobConfigId?: string;
    filters?: EvalResultsFilter;
  }
) {
  const runWhereConditions: (SQL | undefined)[] = [
    projectScopedWhere(evaluationRun, params.scopes),
  ];
  if (params.evaluationRunConfigId) {
    runWhereConditions.push(eq(evaluationRun.evaluationRunConfigId, params.evaluationRunConfigId));
  }
  if (params.evaluationJobConfigId) {
    runWhereConditions.push(eq(evaluationRun.evaluationJobConfigId, params.evaluationJobConfigId));
  }

  const runIdSubquery = db
    .select({ id: evaluationRun.id })
    .from(evaluationRun)
    .where(and(...runWhereConditions));

  const whereConditions: (SQL | undefined)[] = [
    projectScopedWhere(evaluationResult, params.scopes),
    inArray(evaluationResult.evaluationRunId, runIdSubquery),
  ];

  if (params.filters?.evaluatorId) {
    whereConditions.push(eq(evaluationResult.evaluatorId, params.filters.evaluatorId));
  }

  if (params.filters?.agentId) {
    whereConditions.push(eq(conversations.agentId, params.filters.agentId));
  }

  if (params.filters?.conversationId) {
    whereConditions.push(eq(evaluationResult.conversationId, params.filters.conversationId));
  }

  // Filter by when the underlying conversation was created (the "Time" column in
  // the UI), not when the evaluation result row was written.
  if (params.filters?.startDate) {
    whereConditions.push(gte(conversations.createdAt, params.filters.startDate));
  }

  if (params.filters?.endDate) {
    whereConditions.push(lte(conversations.createdAt, params.filters.endDate));
  }

  return { whereConditions };
}

export const listEvaluationResultsPaginated =
  (db: AgentsRunDatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig;
    evaluationRunConfigId?: string;
    evaluationJobConfigId?: string;
    filters?: EvalResultsFilter;
    pagination?: EvalResultsPagination;
  }): Promise<PaginatedEvalResults> => {
    const page = params.pagination?.page ?? 1;
    const limit = Math.min(params.pagination?.limit ?? 50, EVAL_RESULTS_MAX_ROWS);
    const offset = (page - 1) * limit;

    const { whereConditions } = buildEvalResultsBaseQuery(db, {
      scopes: params.scopes,
      evaluationRunConfigId: params.evaluationRunConfigId,
      evaluationJobConfigId: params.evaluationJobConfigId,
      filters: params.filters,
    });

    const conversationsJoin = and(
      eq(evaluationResult.conversationId, conversations.id),
      eq(evaluationResult.tenantId, conversations.tenantId),
      eq(evaluationResult.projectId, conversations.projectId)
    );

    const firstMsg = buildFirstUserMessageSubquery(db);

    const [countResult, rows, agentIdRows, outputKeyRows] = await Promise.all([
      db
        .select({
          total: count(),
          completedCount: count(evaluationResult.output),
        })
        .from(evaluationResult)
        .leftJoin(conversations, conversationsJoin)
        .where(and(...whereConditions)),

      db
        .select({
          id: evaluationResult.id,
          tenantId: evaluationResult.tenantId,
          projectId: evaluationResult.projectId,
          conversationId: evaluationResult.conversationId,
          evaluatorId: evaluationResult.evaluatorId,
          evaluationRunId: evaluationResult.evaluationRunId,
          output: evaluationResult.output,
          createdAt: evaluationResult.createdAt,
          updatedAt: evaluationResult.updatedAt,
          agentId: conversations.agentId,
          conversationCreatedAt: conversations.createdAt,
          firstMsgContent: firstMsg.content,
        })
        .from(evaluationResult)
        .leftJoin(conversations, conversationsJoin)
        .leftJoin(firstMsg, eq(evaluationResult.conversationId, firstMsg.conversationId))
        .where(and(...whereConditions))
        .orderBy(desc(evaluationResult.createdAt))
        .limit(limit)
        .offset(offset),

      db
        .selectDistinct({ agentId: conversations.agentId })
        .from(evaluationResult)
        .leftJoin(conversations, conversationsJoin)
        .where(and(...whereConditions)),

      db
        .select({
          key: sql<string>`jsonb_object_keys(${evaluationResult.output}->'output')`,
        })
        .from(evaluationResult)
        .leftJoin(conversations, conversationsJoin)
        .where(
          and(
            ...whereConditions,
            sql`jsonb_typeof(${evaluationResult.output}->'output') = 'object'`
          )
        )
        .groupBy(sql`jsonb_object_keys(${evaluationResult.output}->'output')`),
    ]);

    const total = countResult[0]?.total ?? 0;
    const completedCount = countResult[0]?.completedCount ?? 0;
    const distinctAgentIds = agentIdRows
      .map((r) => r.agentId)
      .filter((id): id is string => id != null)
      .sort();
    const distinctOutputKeys = outputKeyRows.map((r) => `output.${r.key}`).sort();

    const data: EnrichedEvaluationResult[] = rows.map((row) => {
      let input: string | null = null;
      if (row.firstMsgContent) {
        const content = row.firstMsgContent as MessageContent;
        if (content.text) {
          input = content.text;
        } else if (content.parts) {
          input =
            content.parts
              .filter((part: any) => part.kind === 'text' && part.text)
              .map((part: any) => part.text)
              .join(' ') || null;
        }
      }

      return {
        id: row.id,
        tenantId: row.tenantId,
        projectId: row.projectId,
        conversationId: row.conversationId,
        evaluatorId: row.evaluatorId,
        evaluationRunId: row.evaluationRunId,
        output: row.output,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        input,
        agentId: row.agentId ?? null,
        conversationCreatedAt: row.conversationCreatedAt ?? null,
      };
    });

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
        completedCount,
      },
      distinctAgentIds,
      distinctOutputKeys,
    };
  };

export const listEvaluationResultsByConversation =
  (db: AgentsRunDatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig & { conversationId: string };
  }): Promise<EvaluationResultSelect[]> => {
    return await db.query.evaluationResult.findMany({
      where: and(
        projectScopedWhere(evaluationResult, params.scopes),
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
          projectScopedWhere(evaluationResult, params.scopes),
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
          projectScopedWhere(evaluationResult, params.scopes),
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
          projectScopedWhere(evaluationResult, params.scopes),
          eq(evaluationResult.evaluationRunId, params.scopes.evaluationRunId)
        )
      )
      .returning();

    return result.length;
  };

// ============================================================================
// CONVERSATION FILTERING FOR EVALUATION JOBS
// ============================================================================

/**
 * Helper to extract plain filter criteria from a Filter wrapper.
 * Currently only handles plain objects - and/or combinators are not yet supported.
 */
function extractPlainFilterCriteria(
  filter: Filter<EvaluationJobFilterCriteria> | null | undefined
): EvaluationJobFilterCriteria | null {
  if (!filter) return null;
  // Check if it's an and/or combinator (not yet supported)
  if ('and' in filter || 'or' in filter) {
    // TODO: Implement and/or filter logic if needed
    return null;
  }
  return filter;
}

/**
 * Filter conversations based on evaluation job filter criteria
 */
export const filterConversationsForJob =
  (db: AgentsRunDatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig;
    jobFilters: Filter<EvaluationJobFilterCriteria> | null | undefined;
  }): Promise<ConversationSelect[]> => {
    const { scopes, jobFilters: rawJobFilters } = params;
    const jobFilters = extractPlainFilterCriteria(rawJobFilters);
    const { tenantId, projectId } = scopes;

    const whereConditions = [projectScopedWhere(conversations, scopes)];

    // Filter by conversation IDs if specified
    if (
      jobFilters?.conversationIds &&
      Array.isArray(jobFilters.conversationIds) &&
      jobFilters.conversationIds.length > 0
    ) {
      whereConditions.push(inArray(conversations.id, jobFilters.conversationIds));
    }

    // Filter by date range if specified
    if (jobFilters?.dateRange) {
      const { startDate, endDate } = jobFilters.dateRange;
      if (startDate) {
        whereConditions.push(gte(conversations.createdAt, startDate));
      }
      if (endDate) {
        whereConditions.push(lte(conversations.createdAt, endDate));
      }
    }

    // Filter by dataset run IDs if specified
    if (
      jobFilters?.datasetRunIds &&
      Array.isArray(jobFilters.datasetRunIds) &&
      jobFilters.datasetRunIds.length > 0
    ) {
      // Get conversation IDs from dataset run relations
      const allConversationIds = new Set<string>();
      for (const datasetRunId of jobFilters.datasetRunIds) {
        const relations = await getDatasetRunConversationRelations(db)({
          scopes: { tenantId, projectId, datasetRunId },
        });
        for (const relation of relations) {
          allConversationIds.add(relation.conversationId);
        }
      }

      if (allConversationIds.size > 0) {
        whereConditions.push(inArray(conversations.id, Array.from(allConversationIds)));
      } else {
        // No conversations found in dataset runs, return empty array
        return [];
      }
    }

    const filteredConversations = await db
      .select()
      .from(conversations)
      .where(and(...whereConditions));

    return filteredConversations;
  };
