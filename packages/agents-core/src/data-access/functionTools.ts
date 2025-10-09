import { and, count, desc, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import type { DatabaseClient } from '../db/client';
import { agentFunctionToolRelations, functionTools } from '../db/schema';
import type { FunctionToolApiInsert, FunctionToolApiUpdate } from '../types/entities';
import type { GraphScopeConfig, PaginationConfig } from '../types/utility';
import { getLogger } from '../utils/logger';

const logger = getLogger('functionTools');

/**
 * Get a function tool by ID (graph-scoped)
 */
export const getFunctionToolById =
  (db: DatabaseClient) => async (params: { scopes: GraphScopeConfig; functionToolId: string }) => {
    const result = await db
      .select()
      .from(functionTools)
      .where(
        and(
          eq(functionTools.tenantId, params.scopes.tenantId),
          eq(functionTools.projectId, params.scopes.projectId),
          eq(functionTools.graphId, params.scopes.graphId),
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
  async (params: { scopes: GraphScopeConfig; pagination?: PaginationConfig }) => {
    const page = params.pagination?.page || 1;
    const limit = Math.min(params.pagination?.limit || 10, 100);
    const offset = (page - 1) * limit;

    const whereClause = and(
      eq(functionTools.tenantId, params.scopes.tenantId),
      eq(functionTools.projectId, params.scopes.projectId),
      eq(functionTools.graphId, params.scopes.graphId)
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
  async (params: { data: FunctionToolApiInsert; scopes: GraphScopeConfig }) => {
    const { data, scopes } = params;
    const { tenantId, projectId, graphId } = scopes;

    const [created] = await db
      .insert(functionTools)
      .values({
        tenantId,
        projectId,
        graphId,
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
    scopes: GraphScopeConfig;
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
          eq(functionTools.graphId, params.scopes.graphId),
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
  (db: DatabaseClient) => async (params: { scopes: GraphScopeConfig; functionToolId: string }) => {
    const [deleted] = await db
      .delete(functionTools)
      .where(
        and(
          eq(functionTools.tenantId, params.scopes.tenantId),
          eq(functionTools.projectId, params.scopes.projectId),
          eq(functionTools.graphId, params.scopes.graphId),
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
  async (params: { data: FunctionToolApiInsert; scopes: GraphScopeConfig }) => {
    const scopes = {
      tenantId: params.scopes.tenantId,
      projectId: params.scopes.projectId,
      graphId: params.scopes.graphId,
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

export const getFunctionToolsForAgent = (db: DatabaseClient) => {
  return async (params: {
    scopes: { tenantId: string; projectId: string; graphId: string };
    agentId: string;
  }) => {
    const { scopes, agentId } = params;
    const { tenantId, projectId, graphId } = scopes;

    try {
      // Get function tools for this graph
      const functionToolsList = await listFunctionTools(db)({
        scopes: { tenantId, projectId, graphId },
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
            eq(agentFunctionToolRelations.graphId, graphId),
            eq(agentFunctionToolRelations.agentId, agentId)
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
        { tenantId, projectId, graphId, agentId, error },
        'Failed to get function tools for agent'
      );
      throw error;
    }
  };
};

/**
 * Upsert an agent-function tool relation (create if it doesn't exist, update if it does)
 */
export const upsertAgentFunctionToolRelation =
  (db: DatabaseClient) =>
  async (params: {
    scopes: GraphScopeConfig;
    agentId: string;
    functionToolId: string;
    relationId?: string; // Optional: if provided, update specific relationship
  }) => {
    // If relationId is provided, update that specific relationship
    if (params.relationId) {
      return await updateAgentFunctionToolRelation(db)({
        scopes: params.scopes,
        relationId: params.relationId,
        data: {
          agentId: params.agentId,
          functionToolId: params.functionToolId,
        },
      });
    }

    // No relationId provided - always create a new relationship
    return await addFunctionToolToAgent(db)(params);
  };

/**
 * Add a function tool to an agent
 */
export const addFunctionToolToAgent = (db: DatabaseClient) => {
  return async (params: { scopes: GraphScopeConfig; agentId: string; functionToolId: string }) => {
    const { scopes, agentId, functionToolId } = params;
    const { tenantId, projectId, graphId } = scopes;

    try {
      const relationId = nanoid();

      await db.insert(agentFunctionToolRelations).values({
        id: relationId,
        tenantId,
        projectId,
        graphId,
        agentId,
        functionToolId,
      });

      logger.info(
        { tenantId, projectId, graphId, agentId, functionToolId, relationId },
        'Function tool added to agent'
      );

      return { id: relationId };
    } catch (error) {
      logger.error(
        { tenantId, projectId, graphId, agentId, functionToolId, error },
        'Failed to add function tool to agent'
      );
      throw error;
    }
  };
};

/**
 * Update an agent-function tool relation
 */
export const updateAgentFunctionToolRelation = (db: DatabaseClient) => {
  return async (params: {
    scopes: GraphScopeConfig;
    relationId: string;
    data: {
      agentId: string;
      functionToolId: string;
    };
  }) => {
    const { scopes, relationId, data } = params;
    const { tenantId, projectId, graphId } = scopes;

    try {
      await db
        .update(agentFunctionToolRelations)
        .set({
          agentId: data.agentId,
          functionToolId: data.functionToolId,
        })
        .where(
          and(
            eq(agentFunctionToolRelations.id, relationId),
            eq(agentFunctionToolRelations.tenantId, tenantId),
            eq(agentFunctionToolRelations.projectId, projectId),
            eq(agentFunctionToolRelations.graphId, graphId)
          )
        );

      logger.info(
        { tenantId, projectId, graphId, relationId, data },
        'Agent-function tool relation updated'
      );

      return { id: relationId };
    } catch (error) {
      logger.error(
        { tenantId, projectId, graphId, relationId, data, error },
        'Failed to update agent-function tool relation'
      );
      throw error;
    }
  };
};
