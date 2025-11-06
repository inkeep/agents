import { and, eq, gte, inArray, lte } from 'drizzle-orm';
import type { DatabaseClient } from '../db/client';
import {
  conversationEvaluationConfig,
  conversationEvaluationConfigEvaluator,
  conversations,
  dataset,
  datasetItem,
  evalResult,
  evalTestSuiteConfig,
  evalTestSuiteConfigAgents,
  evaluator,
  subAgents,
} from '../db/schema';

/**
 * Get conversations for evaluation based on filter criteria
 */
export const getConversationsForEvaluation =
  (db: DatabaseClient) =>
  async (params: {
    scopes: { tenantId: string };
    filter?: {
      agentIds?: string[];
      projectIds?: string[];
      dateRange?: {
        startDate: string;
        endDate: string;
      };
      conversationIds?: string[];
    };
  }): Promise<(typeof conversations.$inferSelect)[]> => {
    const { tenantId } = params.scopes;
    const { filter } = params;

    const needsAgentJoin = Boolean(filter?.agentIds?.length);
    const whereClauses = [
      eq(conversations.tenantId, tenantId),
      ...(filter?.projectIds?.length ? [inArray(conversations.projectId, filter.projectIds)] : []),
      ...(filter?.dateRange
        ? [
            gte(conversations.createdAt, filter.dateRange.startDate),
            lte(conversations.createdAt, filter.dateRange.endDate),
          ]
        : []),
      ...(filter?.conversationIds?.length
        ? [inArray(conversations.id, filter.conversationIds)]
        : []),
    ];

    // If filtering by agentIds, join subAgents to resolve activeSubAgentId -> agentId
    if (needsAgentJoin) {
      const rows = await db
        .select({ c: conversations })
        .from(conversations)
        .innerJoin(
          subAgents,
          and(
            eq(conversations.activeSubAgentId, subAgents.id),
            eq(conversations.tenantId, subAgents.tenantId),
            eq(conversations.projectId, subAgents.projectId)
          )
        )
        .where(and(...whereClauses, inArray(subAgents.agentId, filter!.agentIds!)));

      return rows.map((r) => r.c);
    }

    // Otherwise, simple query
    return await db
      .select()
      .from(conversations)
      .where(and(...whereClauses));
  };

/**
 * Get conversation evaluation config by ID
 */
export const getConversationEvaluationConfig =
  (db: DatabaseClient) =>
  async (params: { tenantId: string; conversationEvaluationConfigId: string }) => {
    const { tenantId, conversationEvaluationConfigId } = params;

    return await db.query.conversationEvaluationConfig.findFirst({
      where: and(
        eq(conversationEvaluationConfig.tenantId, tenantId),
        eq(conversationEvaluationConfig.id, conversationEvaluationConfigId)
      ),
    });
  };

/**
 * Get evaluators for a conversation evaluation config
 * Uses a join to fetch evaluators linked to a config in a single query
 */
export const getEvaluatorsForConfig =
  (db: DatabaseClient) =>
  async (params: {
    tenantId: string;
    conversationEvaluationConfigId: string;
  }): Promise<(typeof evaluator.$inferSelect)[]> => {
    const { tenantId, conversationEvaluationConfigId } = params;

    const rows = await db
      .select({ evaluator })
      .from(conversationEvaluationConfigEvaluator)
      .innerJoin(
        evaluator,
        and(
          eq(conversationEvaluationConfigEvaluator.evaluatorId, evaluator.id),
          eq(evaluator.tenantId, tenantId)
        )
      )
      .where(
        eq(
          conversationEvaluationConfigEvaluator.conversationEvaluationConfigId,
          conversationEvaluationConfigId
        )
      );

    return rows.map((r) => r.evaluator);
  };

/**
 * Create eval result
 */
export const createEvalResult =
  (db: DatabaseClient) =>
  async (params: {
    tenantId: string;
    projectId: string;
    conversationId: string;
    evaluatorId: string;
    status: 'pending' | 'done' | 'failed';
    reasoning?: string;
    metadata?: Record<string, unknown>;
    suiteRunId?: string;
    datasetItemId?: string;
  }) => {
    const [result] = await db
      .insert(evalResult)
      .values({
        id: `eval_result_${Date.now()}`,
        tenantId: params.tenantId,
        projectId: params.projectId,
        conversationId: params.conversationId,
        evaluatorId: params.evaluatorId,
        status: params.status,
        reasoning: params.reasoning,
        metadata: params.metadata,
        suiteRunId: params.suiteRunId,
        datasetItemId: params.datasetItemId,
      })
      .returning();

    return result;
  };

/**
 * Update eval result status and data
 */
export const updateEvalResult =
  (db: DatabaseClient) =>
  async (params: {
    id: string;
    status: 'pending' | 'done' | 'failed';
    reasoning?: string;
    metadata?: Record<string, unknown>;
  }) => {
    const now = new Date().toISOString();
    const updates: Record<string, unknown> = { 
      status: params.status,
      updatedAt: now 
    };
    
    if (params.reasoning !== undefined) updates.reasoning = params.reasoning;
    if (params.metadata !== undefined) updates.metadata = params.metadata;

    const [result] = await db
      .update(evalResult)
      .set(updates)
      .where(eq(evalResult.id, params.id))
      .returning();

    return result;
  };

/**
 * Get eval results by conversation
 */
export const getEvalResultsByConversation =
  (db: DatabaseClient) => async (params: { conversationId: string }) => {
    const { conversationId } = params;

    return await db.query.evalResult.findMany({
      where: eq(evalResult.conversationId, conversationId),
      orderBy: (evalResult, { desc }) => [desc(evalResult.createdAt)],
    });
  };

/**
 * Get eval results by evaluator
 */
export const getEvalResultsByEvaluator =
  (db: DatabaseClient) => async (params: { evaluatorId: string }) => {
    const { evaluatorId } = params;

    return await db.query.evalResult.findMany({
      where: eq(evalResult.evaluatorId, evaluatorId),
      orderBy: (evalResult, { desc }) => [desc(evalResult.createdAt)],
    });
  };

/**
 * Get eval result by id
 */
export const getEvalResult = (db: DatabaseClient) => async (params: { id: string }) => {
  return await db.query.evalResult.findFirst({
    where: eq(evalResult.id, params.id),
  });
};

/**
 * Get agentId from a conversation's activeSubAgentId
 */
export const getAgentIdFromConversation =
  (db: DatabaseClient) =>
  async (params: { tenantId: string; projectId: string; activeSubAgentId: string }) => {
    const subAgent = await db.query.subAgents.findFirst({
      where: and(
        eq(subAgents.tenantId, params.tenantId),
        eq(subAgents.projectId, params.projectId),
        eq(subAgents.id, params.activeSubAgentId)
      ),
    });

    return subAgent?.agentId || null;
  };

/**
 * Delete eval result by id
 */
export const deleteEvalResult = (db: DatabaseClient) => async (params: { id: string }) => {
  const [deleted] = await db.delete(evalResult).where(eq(evalResult.id, params.id)).returning();

  return deleted ?? null;
};

/**
 * Create evaluator
 */
export const createEvaluator =
  (db: DatabaseClient) =>
  async (params: {
    tenantId: string;
    id?: string;
    name: string;
    description?: string;
    prompt: string;
    schema: Record<string, unknown>;
    modelConfig?: Record<string, unknown>;
  }) => {
    const now = new Date().toISOString();
    const [row] = await db
      .insert(evaluator)
      .values({
        tenantId: params.tenantId,
        id: params.id ?? `evaluator_${Date.now()}`,
        name: params.name,
        description: params.description ?? '',
        prompt: params.prompt,
        schema: params.schema,
        modelConfig: params.modelConfig as any,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return row;
  };

/**
 * Get evaluator by id (tenant-scoped)
 */
export const getEvaluator =
  (db: DatabaseClient) => async (params: { tenantId: string; evaluatorId: string }) => {
    return await db.query.evaluator.findFirst({
      where: and(eq(evaluator.tenantId, params.tenantId), eq(evaluator.id, params.evaluatorId)),
    });
  };

/**
 * List evaluators (tenant-scoped)
 */
export const listEvaluators = (db: DatabaseClient) => async (params: { tenantId: string }) => {
  return await db.query.evaluator.findMany({
    where: eq(evaluator.tenantId, params.tenantId),
    orderBy: (t, { desc }) => [desc(t.createdAt)],
  });
};

/**
 * Update evaluator
 */
export const updateEvaluator =
  (db: DatabaseClient) =>
  async (params: {
    tenantId: string;
    evaluatorId: string;
    name?: string;
    description?: string;
    prompt?: string;
    schema?: Record<string, unknown>;
    modelConfig?: Record<string, unknown>;
  }) => {
    const now = new Date().toISOString();
    const updates: Record<string, unknown> = { updatedAt: now };
    
    if (params.name !== undefined) updates.name = params.name;
    if (params.description !== undefined) updates.description = params.description;
    if (params.prompt !== undefined) updates.prompt = params.prompt;
    if (params.schema !== undefined) updates.schema = params.schema;
    if (params.modelConfig !== undefined) updates.modelConfig = params.modelConfig;
    
    const [row] = await db
      .update(evaluator)
      .set(updates)
      .where(and(eq(evaluator.tenantId, params.tenantId), eq(evaluator.id, params.evaluatorId)))
      .returning();

    return row ?? null;
  };

/**
 * Delete evaluator
 */
export const deleteEvaluator =
  (db: DatabaseClient) => async (params: { tenantId: string; evaluatorId: string }) => {
    const [row] = await db
      .delete(evaluator)
      .where(and(eq(evaluator.tenantId, params.tenantId), eq(evaluator.id, params.evaluatorId)))
      .returning();

    return row ?? null;
  };

/**
 * Conversation Evaluation Config - Create
 */
export const createConversationEvaluationConfig =
  (db: DatabaseClient) =>
  async (params: {
    tenantId: string;
    id?: string;
    name: string;
    description?: string | null;
    conversationFilter?: {
      agentIds?: string[];
      projectIds?: string[];
      dateRange?: { startDate: string; endDate: string };
      conversationIds?: string[];
    } | null;
    modelConfig?: Record<string, unknown> | null;
    sampleRate?: number | null;
    isActive?: boolean;
  }) => {
    const now = new Date().toISOString();
    const [row] = await db
      .insert(conversationEvaluationConfig)
      .values({
        tenantId: params.tenantId,
        id: params.id ?? `conv_eval_cfg_${Date.now()}`,
        name: params.name,
        description: params.description ?? '',
        conversationFilter: params.conversationFilter ?? undefined,
        modelConfig: params.modelConfig ?? undefined,
        sampleRate: params.sampleRate ?? undefined,
        isActive: params.isActive ?? true,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return row;
  };

/**
 * Conversation Evaluation Config - List (by tenant)
 */
export const listConversationEvaluationConfigs =
  (db: DatabaseClient) => async (params: { tenantId: string }) => {
    return await db.query.conversationEvaluationConfig.findMany({
      where: eq(conversationEvaluationConfig.tenantId, params.tenantId),
      orderBy: (t, { desc }) => [desc(t.createdAt)],
    });
  };

/**
 * Conversation Evaluation Config - Update
 */
export const updateConversationEvaluationConfig =
  (db: DatabaseClient) =>
  async (params: {
    tenantId: string;
    id: string;
    name?: string;
    description?: string;
    conversationFilter?: {
      agentIds?: string[];
      projectIds?: string[];
      dateRange?: { startDate: string; endDate: string };
      conversationIds?: string[];
    };
    modelConfig?: Record<string, unknown>;
    sampleRate?: number;
    isActive?: boolean;
  }) => {
    const now = new Date().toISOString();
    const updates: Record<string, unknown> = { updatedAt: now };
    
    if (params.name !== undefined) updates.name = params.name;
    if (params.description !== undefined) updates.description = params.description;
    if (params.conversationFilter !== undefined) updates.conversationFilter = params.conversationFilter;
    if (params.modelConfig !== undefined) updates.modelConfig = params.modelConfig;
    if (params.sampleRate !== undefined) updates.sampleRate = params.sampleRate;
    if (params.isActive !== undefined) updates.isActive = params.isActive;
    
    const [row] = await db
      .update(conversationEvaluationConfig)
      .set(updates)
      .where(
        and(
          eq(conversationEvaluationConfig.tenantId, params.tenantId),
          eq(conversationEvaluationConfig.id, params.id)
        )
      )
      .returning();

    return row ?? null;
  };

/**
 * Conversation Evaluation Config - Delete
 */
export const deleteConversationEvaluationConfig =
  (db: DatabaseClient) => async (params: { tenantId: string; id: string }) => {
    const [row] = await db
      .delete(conversationEvaluationConfig)
      .where(
        and(
          eq(conversationEvaluationConfig.tenantId, params.tenantId),
          eq(conversationEvaluationConfig.id, params.id)
        )
      )
      .returning();

    return row ?? null;
  };

/**
 * Conversation Evaluation Config - Start (isActive=true)
 */
export const startConversationEvaluationConfig =
  (db: DatabaseClient) => async (params: { tenantId: string; id: string }) => {
    return await updateConversationEvaluationConfig(db)({
      tenantId: params.tenantId,
      id: params.id,
      isActive: true,
    });
  };

/**
 * Conversation Evaluation Config - Stop (isActive=false)
 */
export const stopConversationEvaluationConfig =
  (db: DatabaseClient) => async (params: { tenantId: string; id: string }) => {
    return await updateConversationEvaluationConfig(db)({
      tenantId: params.tenantId,
      id: params.id,
      isActive: false,
    });
  };

/**
 * Link an evaluator to a conversation evaluation config
 */
export const linkEvaluatorToConfig =
  (db: DatabaseClient) =>
  async (params: {
    tenantId: string;
    conversationEvaluationConfigId: string;
    evaluatorId: string;
  }) => {
    const now = new Date().toISOString();
    const [row] = await db
      .insert(conversationEvaluationConfigEvaluator)
      .values({
        id: `${Date.now()}_${Math.random().toString(36).substring(7)}`,
        tenantId: params.tenantId,
        conversationEvaluationConfigId: params.conversationEvaluationConfigId,
        evaluatorId: params.evaluatorId,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return row;
  };

/**
 * Dataset - Create
 */
export const createDataset =
  (db: DatabaseClient) =>
  async (params: {
    tenantId: string;
    id?: string;
    name: string;
    description?: string;
    metadata?: Record<string, unknown>;
  }) => {
    const now = new Date().toISOString();
    const [row] = await db
      .insert(dataset)
      .values({
        tenantId: params.tenantId,
        id: params.id ?? `dataset_${Date.now()}`,
        name: params.name,
        description: params.description ?? '',
        metadata: params.metadata ?? undefined,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return row;
  };

/**
 * Dataset - Get by ID (tenant-scoped)
 */
export const getDataset =
  (db: DatabaseClient) => async (params: { tenantId: string; datasetId: string }) => {
    return await db.query.dataset.findFirst({
      where: and(eq(dataset.tenantId, params.tenantId), eq(dataset.id, params.datasetId)),
    });
  };

/**
 * Dataset - List (tenant-scoped)
 */
export const listDatasets = (db: DatabaseClient) => async (params: { tenantId: string }) => {
  return await db.query.dataset.findMany({
    where: eq(dataset.tenantId, params.tenantId),
    orderBy: (t, { desc }) => [desc(t.createdAt)],
  });
};

/**
 * Dataset - Update
 */
export const updateDataset =
  (db: DatabaseClient) =>
  async (params: {
    tenantId: string;
    datasetId: string;
    name?: string;
    description?: string;
    metadata?: Record<string, unknown>;
  }) => {
    const now = new Date().toISOString();
    const updates: Record<string, unknown> = { updatedAt: now };
    
    if (params.name !== undefined) updates.name = params.name;
    if (params.description !== undefined) updates.description = params.description;
    if (params.metadata !== undefined) updates.metadata = params.metadata;
    
    const [row] = await db
      .update(dataset)
      .set(updates)
      .where(and(eq(dataset.tenantId, params.tenantId), eq(dataset.id, params.datasetId)))
      .returning();

    return row ?? null;
  };

/**
 * Dataset - Delete
 */
export const deleteDataset =
  (db: DatabaseClient) => async (params: { tenantId: string; datasetId: string }) => {
    const [row] = await db
      .delete(dataset)
      .where(and(eq(dataset.tenantId, params.tenantId), eq(dataset.id, params.datasetId)))
      .returning();

    return row ?? null;
  };

/**
 * Dataset Item - Create
 */
export const createDatasetItem =
  (db: DatabaseClient) =>
  async (params: {
    id?: string;
    datasetId: string;
    input?: {
      messages: Array<{ role: string; content: unknown }>;
      headers?: Record<string, string>;
    };
    expectedOutput?: Array<{ role: string; content: unknown }>;
    simulationConfig?: {
      userPersona: string;
      initialMessage?: string;
      maxTurns?: number;
      stoppingCondition?: string;
      simulatingAgentDefinition: {
        name: string;
        description: string;
        prompt: string;
        modelConfig?: Record<string, unknown>;
      };
    };
  }) => {
    const now = new Date().toISOString();
    const [row] = await db
      .insert(datasetItem)
      .values({
        id: params.id ?? `dataset_item_${Date.now()}`,
        datasetId: params.datasetId,
        input: (params.input as any) ?? undefined,
        expectedOutput: (params.expectedOutput as any) ?? undefined,
        simulationConfig: (params.simulationConfig as any) ?? undefined,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return row;
  };

/**
 * Dataset Item - Get by ID
 */
export const getDatasetItem = (db: DatabaseClient) => async (params: { id: string }) => {
  return await db.query.datasetItem.findFirst({
    where: eq(datasetItem.id, params.id),
  });
};

/**
 * Dataset Item - List (by dataset ID)
 */
export const listDatasetItems = (db: DatabaseClient) => async (params: { datasetId: string }) => {
  return await db.query.datasetItem.findMany({
    where: eq(datasetItem.datasetId, params.datasetId),
    orderBy: (t, { desc }) => [desc(t.createdAt)],
  });
};

/**
 * Dataset Item - Update
 */
export const updateDatasetItem =
  (db: DatabaseClient) =>
  async (params: {
    id: string;
    input?: {
      messages: Array<{ role: string; content: unknown }>;
      headers?: Record<string, string>;
    };
    expectedOutput?: Array<{ role: string; content: unknown }>;
    simulationConfig?: {
      userPersona: string;
      initialMessage?: string;
      maxTurns?: number;
      stoppingCondition?: string;
      simulatingAgentDefinition: {
        name: string;
        description: string;
        prompt: string;
        modelConfig?: Record<string, unknown>;
      };
    };
  }) => {
    const now = new Date().toISOString();
    const updates: Record<string, unknown> = { updatedAt: now };
    
    if (params.input !== undefined) updates.input = params.input;
    if (params.expectedOutput !== undefined) updates.expectedOutput = params.expectedOutput;
    if (params.simulationConfig !== undefined) updates.simulationConfig = params.simulationConfig;
    
    const [row] = await db
      .update(datasetItem)
      .set(updates)
      .where(eq(datasetItem.id, params.id))
      .returning();

    return row ?? null;
  };

/**
 * Dataset Item - Delete
 */
export const deleteDatasetItem = (db: DatabaseClient) => async (params: { id: string }) => {
  const [row] = await db.delete(datasetItem).where(eq(datasetItem.id, params.id)).returning();

  return row ?? null;
};

/**
 * Eval Test Suite Config - Create
 */
export const createEvalTestSuiteConfig =
  (db: DatabaseClient) =>
  async (params: {
    tenantId: string;
    id?: string;
    name: string;
    description?: string;
    modelConfig?: Record<string, unknown>;
    runFrequency: string;
  }) => {
    const now = new Date().toISOString();
    const [row] = await db
      .insert(evalTestSuiteConfig)
      .values({
        tenantId: params.tenantId,
        id: params.id ?? `eval_test_suite_cfg_${Date.now()}`,
        name: params.name,
        description: params.description ?? '',
        modelConfig: params.modelConfig as any,
        runFrequency: params.runFrequency,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return row;
  };

/**
 * Eval Test Suite Config - Get by ID (tenant-scoped)
 */
export const getEvalTestSuiteConfig =
  (db: DatabaseClient) => async (params: { tenantId: string; evalTestSuiteConfigId: string }) => {
    return await db.query.evalTestSuiteConfig.findFirst({
      where: and(
        eq(evalTestSuiteConfig.tenantId, params.tenantId),
        eq(evalTestSuiteConfig.id, params.evalTestSuiteConfigId)
      ),
    });
  };

/**
 * Eval Test Suite Config - List (tenant-scoped)
 */
export const listEvalTestSuiteConfigs =
  (db: DatabaseClient) => async (params: { tenantId: string }) => {
    return await db.query.evalTestSuiteConfig.findMany({
      where: eq(evalTestSuiteConfig.tenantId, params.tenantId),
      orderBy: (t, { desc }) => [desc(t.createdAt)],
    });
  };

/**
 * Eval Test Suite Config - Update
 */
export const updateEvalTestSuiteConfig =
  (db: DatabaseClient) =>
  async (params: {
    tenantId: string;
    id: string;
    name?: string;
    description?: string;
    modelConfig?: Record<string, unknown>;
    runFrequency?: string;
  }) => {
    const now = new Date().toISOString();
    const updates: Record<string, unknown> = { updatedAt: now };
    
    if (params.name !== undefined) updates.name = params.name;
    if (params.description !== undefined) updates.description = params.description;
    if (params.modelConfig !== undefined) updates.modelConfig = params.modelConfig;
    if (params.runFrequency !== undefined) updates.runFrequency = params.runFrequency;
    
    const [row] = await db
      .update(evalTestSuiteConfig)
      .set(updates)
      .where(
        and(
          eq(evalTestSuiteConfig.tenantId, params.tenantId),
          eq(evalTestSuiteConfig.id, params.id)
        )
      )
      .returning();

    return row ?? null;
  };

/**
 * Eval Test Suite Config Agents - Associate agents with test suite config
 */
export const associateAgentsWithTestSuiteConfig =
  (db: DatabaseClient) =>
  async (params: {
    tenantId: string;
    testSuiteConfigId: string;
    agentIds: string[];
  }) => {
    const now = new Date().toISOString();
    
    // First, remove existing associations
    await db
      .delete(evalTestSuiteConfigAgents)
      .where(
        and(
          eq(evalTestSuiteConfigAgents.tenantId, params.tenantId),
          eq(evalTestSuiteConfigAgents.testSuiteConfigId, params.testSuiteConfigId)
        )
      );
    
    // Then add new associations
    if (params.agentIds.length > 0) {
      const values = params.agentIds.map(agentId => ({
        tenantId: params.tenantId,
        testSuiteConfigId: params.testSuiteConfigId,
        agentId,
        createdAt: now,
        updatedAt: now,
      }));
      
      await db.insert(evalTestSuiteConfigAgents).values(values);
    }
    
    return { success: true };
  };

/**
 * Eval Test Suite Config Agents - Get agents for test suite config
 */
export const getAgentsForTestSuiteConfig =
  (db: DatabaseClient) =>
  async (params: {
    tenantId: string;
    testSuiteConfigId: string;
  }) => {
    const rows = await db
      .select()
      .from(evalTestSuiteConfigAgents)
      .where(
        and(
          eq(evalTestSuiteConfigAgents.tenantId, params.tenantId),
          eq(evalTestSuiteConfigAgents.testSuiteConfigId, params.testSuiteConfigId)
        )
      );
    
    return rows.map(row => row.agentId);
  };

/**
 * Eval Test Suite Config Agents - Get test suite configs for agent
 */
export const getTestSuiteConfigsForAgent =
  (db: DatabaseClient) =>
  async (params: {
    agentId: string;
  }) => {
    const rows = await db
      .select({
        testSuiteConfigId: evalTestSuiteConfigAgents.testSuiteConfigId,
        tenantId: evalTestSuiteConfigAgents.tenantId,
      })
      .from(evalTestSuiteConfigAgents)
      .where(eq(evalTestSuiteConfigAgents.agentId, params.agentId));
    
    return rows;
  };

/**
 * Eval Test Suite Config - Delete
 */
export const deleteEvalTestSuiteConfig =
  (db: DatabaseClient) => async (params: { tenantId: string; id: string }) => {
    const [row] = await db
      .delete(evalTestSuiteConfig)
      .where(
        and(
          eq(evalTestSuiteConfig.tenantId, params.tenantId),
          eq(evalTestSuiteConfig.id, params.id)
        )
      )
      .returning();

    return row ?? null;
  };
