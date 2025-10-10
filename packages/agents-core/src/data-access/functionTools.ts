import { and, count, desc, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import type { DatabaseClient } from '../db/client';
import { agentFunctionToolRelations, functionTools } from '../db/schema';
import type { FunctionToolApiInsert, FunctionToolApiUpdate } from '../types/entities';
import type { AgentScopeConfig, PaginationConfig } from '../types/utility';
import { getLogger } from '../utils/logger';

const logger = getLogger('functionTools');

/**
 * Get a function tool by ID (graph-scoped)
 */
export const getFunctionToolById =
  (db: DatabaseClient) => async (params: { scopes: AgentScopeConfig; functionToolId: string }) => {
    const result = await db
      .select()
      .from(functionTools)
      .where(
        and(
          eq(functionTools.tenantId, params.scopes.tenantId),
          eq(functionTools.projectId, params.scopes.projectId),
          eq(functionTools.agentId, params.scopes.agentId),
          eq(functionTools.id, params.functionToolId)
        )
      )
      .limit(1);

    return result[0] ?? null;
  };

/**
 * List function tools (graph-scoped)
 */
export const listFunctionTools =
  (db: DatabaseClient) =>
  async (params: { scopes: AgentScopeConfig; pagination?: PaginationConfig }) => {
    const page = params.pagination?.page || 1;
    const limit = Math.min(params.pagination?.limit || 10, 100);
    const offset = (page - 1) * limit;

    const whereClause = and(
      eq(functionTools.tenantId, params.scopes.tenantId),
      eq(functionTools.projectId, params.scopes.projectId),
      eq(functionTools.agentId, params.scopes.agentId)
    );

    const [functionToolsDbResults, totalResult] = await Promise.all([
      db
        .select()
        .from(functionTools)
        .where(whereClause)
        .limit(limit)
        .offset(offset)
        .orderBy(desc(functionTools.createdAt)),
      db.select({ count: count() }).from(functionTools).where(whereClause),
    ]);

    const total = totalResult[0]?.count || 0;
    const pages = Math.ceil(total / limit);

    return {
      data: functionToolsDbResults,
      pagination: { page, limit, total, pages },
    };
  };

/**
 * Create a function tool (graph-scoped)
 */
export const createFunctionTool =
  (db: DatabaseClient) =>
  async (params: { data: FunctionToolApiInsert; scopes: AgentScopeConfig }) => {
    const { data, scopes } = params;
    const { tenantId, projectId, agentId } = scopes;

    const [created] = await db
      .insert(functionTools)
      .values({
        tenantId,
        projectId,
        agentId,
        id: data.id,
        name: data.name,
        description: data.description,
        functionId: data.functionId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .returning();

    return created;
  };

/**
 * Update a function tool (graph-scoped)
 */
export const updateFunctionTool =
  (db: DatabaseClient) =>
  async (params: {
    scopes: AgentScopeConfig;
    functionToolId: string;
    data: FunctionToolApiUpdate;
  }) => {
    const now = new Date().toISOString();

    const [updated] = await db
      .update(functionTools)
      .set({
        ...params.data,
        updatedAt: now,
      })
      .where(
        and(
          eq(functionTools.tenantId, params.scopes.tenantId),
          eq(functionTools.projectId, params.scopes.projectId),
          eq(functionTools.agentId, params.scopes.agentId),
          eq(functionTools.id, params.functionToolId)
        )
      )
      .returning();

    return updated ?? null;
  };

/**
 * Delete a function tool (graph-scoped)
 */
export const deleteFunctionTool =
  (db: DatabaseClient) => async (params: { scopes: AgentScopeConfig; functionToolId: string }) => {
    const [deleted] = await db
      .delete(functionTools)
      .where(
        and(
          eq(functionTools.tenantId, params.scopes.tenantId),
          eq(functionTools.projectId, params.scopes.projectId),
          eq(functionTools.agentId, params.scopes.agentId),
          eq(functionTools.id, params.functionToolId)
        )
      )
      .returning();

    return !!deleted;
  };

/**
 * Upsert a function tool (create if it doesn't exist, update if it does)
 */
export const upsertFunctionTool =
  (db: DatabaseClient) =>
  async (params: { data: FunctionToolApiInsert; scopes: AgentScopeConfig }) => {
    const scopes = {
      tenantId: params.scopes.tenantId,
      projectId: params.scopes.projectId,
      agentId: params.scopes.agentId,
    };

    const existing = await getFunctionToolById(db)({
      scopes,
      functionToolId: params.data.id,
    });

    if (existing) {
      // Update existing function tool
      return await updateFunctionTool(db)({
        scopes,
        functionToolId: params.data.id,
        data: {
          name: params.data.name,
          description: params.data.description,
          functionId: params.data.functionId,
        },
      });
    } else {
      // Create new function tool
      return await createFunctionTool(db)({
        data: params.data,
        scopes,
      });
    }
  };

export const getFunctionToolsForSubAgent = (db: DatabaseClient) => {
  return async (params: {
    scopes: { tenantId: string; projectId: string; agentId: string };
    subAgentId: string;
  }) => {
    const { scopes, subAgentId } = params;
    const { tenantId, projectId, agentId } = scopes;

    try {
      // Get function tools for this graph
      const functionToolsList = await listFunctionTools(db)({
        scopes: { tenantId, projectId, agentId },
        pagination: { page: 1, limit: 1000 },
      });

      // Get agent-function tool relations for this agent
      const relations = await db
        .select()
        .from(agentFunctionToolRelations)
        .where(
          and(
            eq(agentFunctionToolRelations.tenantId, tenantId),
            eq(agentFunctionToolRelations.projectId, projectId),
            eq(agentFunctionToolRelations.agentId, agentId),
            eq(agentFunctionToolRelations.subAgentId, subAgentId)
          )
        );

      // Filter function tools that are related to this agent
      const relatedFunctionToolIds = new Set(relations.map((r) => r.functionToolId));
      const agentFunctionTools = functionToolsList.data.filter((ft) =>
        relatedFunctionToolIds.has(ft.id)
      );

      return {
        data: agentFunctionTools,
        pagination: functionToolsList.pagination,
      };
    } catch (error) {
      logger.error(
        { tenantId, projectId, agentId, subAgentId, error },
        'Failed to get function tools for agent'
      );
      throw error;
    }
  };
};

/**
 * Upsert an agent-function tool relation (create if it doesn't exist, update if it does)
 */
export const upsertSubAgentFunctionToolRelation =
  (db: DatabaseClient) =>
  async (params: {
    scopes: AgentScopeConfig;
    subAgentId: string;
    functionToolId: string;
    relationId?: string; // Optional: if provided, update specific relationship
  }) => {
    // If relationId is provided, update that specific relationship
    if (params.relationId) {
      return await updateSubAgentFunctionToolRelation(db)({
        scopes: params.scopes,
        relationId: params.relationId,
        data: {
          subAgentId: params.subAgentId,
          functionToolId: params.functionToolId,
        },
      });
    }

    // No relationId provided - always create a new relationship
    return await addFunctionToolToSubAgent(db)(params);
  };

/**
 * Add a function tool to an agent
 */
export const addFunctionToolToSubAgent = (db: DatabaseClient) => {
  return async (params: {
    scopes: AgentScopeConfig;
    subAgentId: string;
    functionToolId: string;
  }) => {
    const { scopes, subAgentId, functionToolId } = params;
    const { tenantId, projectId, agentId } = scopes;

    try {
      const relationId = nanoid();

      await db.insert(agentFunctionToolRelations).values({
        id: relationId,
        tenantId,
        projectId,
        agentId,
        subAgentId,
        functionToolId,
      });

      logger.info(
        { tenantId, projectId, agentId, subAgentId, functionToolId, relationId },
        'Function tool added to agent'
      );

      return { id: relationId };
    } catch (error) {
      logger.error(
        { tenantId, projectId, agentId, subAgentId, functionToolId, error },
        'Failed to add function tool to agent'
      );
      throw error;
    }
  };
};

/**
 * Update an agent-function tool relation
 */
export const updateSubAgentFunctionToolRelation = (db: DatabaseClient) => {
  return async (params: {
    scopes: AgentScopeConfig;
    relationId: string;
    data: {
      subAgentId: string;
      functionToolId: string;
    };
  }) => {
    const { scopes, relationId, data } = params;
    const { tenantId, projectId, agentId } = scopes;

    try {
      await db
        .update(agentFunctionToolRelations)
        .set({
          subAgentId: data.subAgentId,
          functionToolId: data.functionToolId,
        })
        .where(
          and(
            eq(agentFunctionToolRelations.id, relationId),
            eq(agentFunctionToolRelations.tenantId, tenantId),
            eq(agentFunctionToolRelations.projectId, projectId),
            eq(agentFunctionToolRelations.agentId, agentId)
          )
        );

      logger.info(
        { tenantId, projectId, agentId, relationId, data },
        'Agent-function tool relation updated'
      );

      return { id: relationId };
    } catch (error) {
      logger.error(
        { tenantId, projectId, agentId, relationId, data, error },
        'Failed to update agent-function tool relation'
      );
      throw error;
    }
  };
};
