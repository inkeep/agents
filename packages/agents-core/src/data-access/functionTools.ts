import { and, count, desc, eq } from 'drizzle-orm';
import type { DatabaseClient } from '../db/client';
import { createDataAccessFn } from '../db/data-access-helper';
import { functionTools, subAgentFunctionToolRelations } from '../db/schema';
import type { FunctionToolApiInsert, FunctionToolApiUpdate } from '../types/entities';
import type { AgentScopeConfig, PaginationConfig } from '../types/utility';
import { generateId } from '../utils/conversations';
import { getLogger } from '../utils/logger';

const logger = getLogger('functionTools');

/**
 * Get a function tool by ID (agent-scoped)
 */
export const getFunctionToolById = createDataAccessFn(
  async (db: DatabaseClient, params: { scopes: AgentScopeConfig; functionToolId: string }) => {
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
  }
);

/**
 * List function tools (agent-scoped)
 */
export const listFunctionTools = createDataAccessFn(
  async (db: DatabaseClient, params: { scopes: AgentScopeConfig; pagination?: PaginationConfig }) => {
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
  }
);

/**
 * Create a function tool (agent-scoped)
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
 * Update a function tool (agent-scoped)
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
 * Delete a function tool (agent-scoped)
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
      return await updateFunctionTool(db)({
        scopes,
        functionToolId: params.data.id,
        data: {
          name: params.data.name,
          description: params.data.description,
          functionId: params.data.functionId,
        },
      });
    }
    return await createFunctionTool(db)({
      data: params.data,
      scopes,
    });
  };

export const getFunctionToolsForSubAgent = createDataAccessFn(
  async (
    db: DatabaseClient,
    params: {
      scopes: { tenantId: string; projectId: string; agentId: string };
      subAgentId: string;
    }
  ) => {
    const { scopes, subAgentId } = params;
    const { tenantId, projectId, agentId } = scopes;

    try {
      const functionToolsList = await listFunctionTools(db)({
        scopes: { tenantId, projectId, agentId },
        pagination: { page: 1, limit: 1000 },
      });

      const relations = await db
        .select()
        .from(subAgentFunctionToolRelations)
        .where(
          and(
            eq(subAgentFunctionToolRelations.tenantId, tenantId),
            eq(subAgentFunctionToolRelations.projectId, projectId),
            eq(subAgentFunctionToolRelations.agentId, agentId),
            eq(subAgentFunctionToolRelations.subAgentId, subAgentId)
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
  }
);

/**
 * Upsert a sub_agent-function tool relation (create if it doesn't exist, update if it does)
 */
export const upsertSubAgentFunctionToolRelation =
  (db: DatabaseClient) =>
  async (params: {
    scopes: AgentScopeConfig;
    subAgentId: string;
    functionToolId: string;
    relationId?: string; // Optional: if provided, update specific relationship
  }) => {
    const { scopes, subAgentId, functionToolId, relationId } = params;
    const { tenantId, projectId, agentId } = scopes;

    // If relationId is provided, update that specific relationship
    if (relationId) {
      return await updateSubAgentFunctionToolRelation(db)({
        scopes,
        relationId,
        data: {
          subAgentId,
          functionToolId,
        },
      });
    }

    // No relationId provided - check if relation already exists
    try {
      const existingRelations = await db
        .select()
        .from(subAgentFunctionToolRelations)
        .where(
          and(
            eq(subAgentFunctionToolRelations.tenantId, tenantId),
            eq(subAgentFunctionToolRelations.projectId, projectId),
            eq(subAgentFunctionToolRelations.agentId, agentId),
            eq(subAgentFunctionToolRelations.subAgentId, subAgentId),
            eq(subAgentFunctionToolRelations.functionToolId, functionToolId)
          )
        )
        .limit(1);

      // If relation exists, return it instead of creating a new one
      if (existingRelations.length > 0) {
        logger.info(
          {
            tenantId,
            projectId,
            agentId,
            subAgentId,
            functionToolId,
            relationId: existingRelations[0].id,
          },
          'Sub_agent-function tool relation already exists, returning existing relation'
        );
        return { id: existingRelations[0].id };
      }

      // Relation doesn't exist, create a new one
      return await addFunctionToolToSubAgent(db)(params);
    } catch (error) {
      logger.error(
        { tenantId, projectId, agentId, subAgentId, functionToolId, error },
        'Failed to upsert sub_agent-function tool relation'
      );
      throw error;
    }
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
      const relationId = generateId();

      await db.insert(subAgentFunctionToolRelations).values({
        id: relationId,
        tenantId,
        projectId,
        agentId,
        subAgentId,
        functionToolId,
      });

      logger.info(
        { tenantId, projectId, agentId, subAgentId, functionToolId, relationId },
        'Function tool added to sub_agent'
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
        .update(subAgentFunctionToolRelations)
        .set({
          subAgentId: data.subAgentId,
          functionToolId: data.functionToolId,
        })
        .where(
          and(
            eq(subAgentFunctionToolRelations.id, relationId),
            eq(subAgentFunctionToolRelations.tenantId, tenantId),
            eq(subAgentFunctionToolRelations.projectId, projectId),
            eq(subAgentFunctionToolRelations.agentId, agentId)
          )
        );

      logger.info(
        { tenantId, projectId, agentId, relationId, data },
        'SubAgent-function tool relation updated'
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
