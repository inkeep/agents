import { and, count, desc, eq } from 'drizzle-orm';
import type { AgentsManageDatabaseClient } from '../../db/manage/manage-client';
import { functionTools, subAgentFunctionToolRelations } from '../../db/manage/manage-schema';
import type { FunctionToolApiInsert, FunctionToolApiUpdate } from '../../types/entities';
import type { AgentScopeConfig, PaginationConfig } from '../../types/utility';
import { generateId } from '../../utils/conversations';
import { getLogger } from '../../utils/logger';

const logger = getLogger('functionTools');

/**
 * Get a function tool by ID (agent-scoped)
 */
export const getFunctionToolById =
  (db: AgentsManageDatabaseClient) =>
  async (params: { scopes: AgentScopeConfig; functionToolId: string }) => {
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
 * List function tools (agent-scoped)
 */
export const listFunctionTools =
  (db: AgentsManageDatabaseClient) =>
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
 * Create a function tool (agent-scoped)
 */
export const createFunctionTool =
  (db: AgentsManageDatabaseClient) =>
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
  (db: AgentsManageDatabaseClient) =>
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
  (db: AgentsManageDatabaseClient) =>
  async (params: { scopes: AgentScopeConfig; functionToolId: string }) => {
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
  (db: AgentsManageDatabaseClient) =>
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

export const getFunctionToolsForSubAgent = (db: AgentsManageDatabaseClient) => {
  return async (params: {
    scopes: { tenantId: string; projectId: string; agentId: string };
    subAgentId: string;
    pagination?: PaginationConfig;
  }) => {
    const page = params.pagination?.page || 1;
    const limit = Math.min(params.pagination?.limit || 1000, 1000);
    const offset = (page - 1) * limit;

    const { tenantId, projectId, agentId } = params.scopes;

    try {
      const whereClause = and(
        eq(subAgentFunctionToolRelations.tenantId, tenantId),
        eq(subAgentFunctionToolRelations.projectId, projectId),
        eq(subAgentFunctionToolRelations.agentId, agentId),
        eq(subAgentFunctionToolRelations.subAgentId, params.subAgentId)
      );

      const [data, totalResult] = await Promise.all([
        db
          .select({
            id: functionTools.id,
            name: functionTools.name,
            description: functionTools.description,
            functionId: functionTools.functionId,
            createdAt: functionTools.createdAt,
            updatedAt: functionTools.updatedAt,
            tenantId: functionTools.tenantId,
            projectId: functionTools.projectId,
            agentId: functionTools.agentId,
            relationshipId: subAgentFunctionToolRelations.id,
          })
          .from(subAgentFunctionToolRelations)
          .innerJoin(
            functionTools,
            and(
              eq(subAgentFunctionToolRelations.functionToolId, functionTools.id),
              eq(subAgentFunctionToolRelations.tenantId, functionTools.tenantId),
              eq(subAgentFunctionToolRelations.projectId, functionTools.projectId),
              eq(subAgentFunctionToolRelations.agentId, functionTools.agentId)
            )
          )
          .where(whereClause)
          .limit(limit)
          .offset(offset)
          .orderBy(desc(subAgentFunctionToolRelations.createdAt)),
        db.select({ count: count() }).from(subAgentFunctionToolRelations).where(whereClause),
      ]);

      const total = totalResult[0]?.count || 0;
      const pages = Math.ceil(total / limit);

      return {
        data,
        pagination: { page, limit, total, pages },
      };
    } catch (error) {
      logger.error(
        { tenantId, projectId, agentId, subAgentId: params.subAgentId, error },
        'Failed to get function tools for agent'
      );
      throw error;
    }
  };
};

/**
 * Upsert a sub_agent-function tool relation (create if it doesn't exist, update if it does)
 */
export const upsertSubAgentFunctionToolRelation =
  (db: AgentsManageDatabaseClient) =>
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
export const addFunctionToolToSubAgent = (db: AgentsManageDatabaseClient) => {
  return async (params: {
    scopes: AgentScopeConfig;
    subAgentId: string;
    functionToolId: string;
  }) => {
    const { scopes, subAgentId, functionToolId } = params;
    const { tenantId, projectId, agentId } = scopes;

    try {
      const relationId = generateId();

      const [result] = await db
        .insert(subAgentFunctionToolRelations)
        .values({
          id: relationId,
          tenantId,
          projectId,
          agentId,
          subAgentId,
          functionToolId,
        })
        .returning();

      logger.info(
        { tenantId, projectId, agentId, subAgentId, functionToolId, relationId },
        'Function tool added to sub_agent'
      );

      return result;
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
export const updateSubAgentFunctionToolRelation = (db: AgentsManageDatabaseClient) => {
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

/**
 * Get all sub-agents that use a specific function tool
 */
export const getSubAgentsUsingFunctionTool = (db: AgentsManageDatabaseClient) => {
  return async (params: { scopes: AgentScopeConfig; functionToolId: string }) => {
    const { scopes, functionToolId } = params;
    const { tenantId, projectId, agentId } = scopes;

    try {
      const relations = await db
        .select({
          subAgentId: subAgentFunctionToolRelations.subAgentId,
          createdAt: subAgentFunctionToolRelations.createdAt,
        })
        .from(subAgentFunctionToolRelations)
        .where(
          and(
            eq(subAgentFunctionToolRelations.tenantId, tenantId),
            eq(subAgentFunctionToolRelations.projectId, projectId),
            eq(subAgentFunctionToolRelations.agentId, agentId),
            eq(subAgentFunctionToolRelations.functionToolId, functionToolId)
          )
        );

      return relations;
    } catch (error) {
      logger.error(
        { tenantId, projectId, agentId, functionToolId, error },
        'Failed to get sub-agents using function tool'
      );
      throw error;
    }
  };
};

/**
 * Remove a function tool from a sub-agent
 */
export const removeFunctionToolFromSubAgent = (db: AgentsManageDatabaseClient) => {
  return async (params: {
    scopes: AgentScopeConfig;
    subAgentId: string;
    functionToolId: string;
  }): Promise<boolean> => {
    const { scopes, subAgentId, functionToolId } = params;
    const { tenantId, projectId, agentId } = scopes;

    try {
      const result = await db
        .delete(subAgentFunctionToolRelations)
        .where(
          and(
            eq(subAgentFunctionToolRelations.tenantId, tenantId),
            eq(subAgentFunctionToolRelations.projectId, projectId),
            eq(subAgentFunctionToolRelations.agentId, agentId),
            eq(subAgentFunctionToolRelations.subAgentId, subAgentId),
            eq(subAgentFunctionToolRelations.functionToolId, functionToolId)
          )
        )
        .returning();

      const removed = result.length > 0;
      if (removed) {
        logger.info(
          { tenantId, projectId, agentId, subAgentId, functionToolId },
          'Function tool removed from sub-agent'
        );
      }

      return removed;
    } catch (error) {
      logger.error(
        { tenantId, projectId, agentId, subAgentId, functionToolId, error },
        'Failed to remove function tool from sub-agent'
      );
      throw error;
    }
  };
};

/**
 * Check if a function tool is associated with a sub-agent
 */
export const isFunctionToolAssociatedWithSubAgent = (db: AgentsManageDatabaseClient) => {
  return async (params: {
    scopes: AgentScopeConfig;
    subAgentId: string;
    functionToolId: string;
  }): Promise<boolean> => {
    const { scopes, subAgentId, functionToolId } = params;
    const { tenantId, projectId, agentId } = scopes;

    try {
      const result = await db
        .select({ id: subAgentFunctionToolRelations.id })
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

      return result.length > 0;
    } catch (error) {
      logger.error(
        { tenantId, projectId, agentId, subAgentId, functionToolId, error },
        'Failed to check function tool association with sub-agent'
      );
      throw error;
    }
  };
};

/**
 * Associate a function tool with a sub-agent (alias for addFunctionToolToSubAgent)
 */
export const associateFunctionToolWithSubAgent = (db: AgentsManageDatabaseClient) => {
  return addFunctionToolToSubAgent(db);
};
