import { and, count, desc, eq, sql } from 'drizzle-orm';
import type { DatabaseClient } from '../db/client';
import { contextConfigs } from '../db/schema';
import type { ContextConfigInsert, ContextConfigUpdate } from '../types/entities';
import type { AgentScopeConfig, PaginationConfig } from '../types/utility';
import { generateId } from '../utils/conversations';

export const getContextConfigById =
  (db: DatabaseClient) => async (params: { scopes: AgentScopeConfig; id: string }) => {
    return await db.query.contextConfigs.findFirst({
      where: and(
        eq(contextConfigs.tenantId, params.scopes.tenantId),
        eq(contextConfigs.projectId, params.scopes.projectId),
        eq(contextConfigs.agentId, params.scopes.agentId),
        eq(contextConfigs.id, params.id)
      ),
    });
  };

export const listContextConfigs =
  (db: DatabaseClient) => async (params: { scopes: AgentScopeConfig }) => {
    return await db.query.contextConfigs.findMany({
      where: and(
        eq(contextConfigs.tenantId, params.scopes.tenantId),
        eq(contextConfigs.projectId, params.scopes.projectId),
        eq(contextConfigs.agentId, params.scopes.agentId)
      ),
      orderBy: [desc(contextConfigs.createdAt)],
    });
  };

export const listContextConfigsPaginated =
  (db: DatabaseClient) =>
  async (params: {
    scopes: AgentScopeConfig;
    pagination?: PaginationConfig;
  }): Promise<{
    data: any[];
    pagination: { page: number; limit: number; total: number; pages: number };
  }> => {
    const page = params.pagination?.page || 1;
    const limit = Math.min(params.pagination?.limit || 10, 100);
    const offset = (page - 1) * limit;

    const whereClause = and(
      eq(contextConfigs.tenantId, params.scopes.tenantId),
      eq(contextConfigs.projectId, params.scopes.projectId),
      eq(contextConfigs.agentId, params.scopes.agentId)
    );

    const [contextConfigList, totalResult] = await Promise.all([
      db
        .select()
        .from(contextConfigs)
        .where(whereClause)
        .limit(limit)
        .offset(offset)
        .orderBy(desc(contextConfigs.createdAt)),
      db.select({ count: sql`COUNT(*)` }).from(contextConfigs).where(whereClause),
    ]);

    const total = Number(totalResult[0]?.count || 0);
    const pages = Math.ceil(total / limit);

    return {
      data: contextConfigList,
      pagination: {
        page,
        limit,
        total,
        pages,
      },
    };
  };

export const createContextConfig = (db: DatabaseClient) => async (params: ContextConfigInsert) => {
  const id = params.id || generateId();
  const now = new Date().toISOString();

  // Process contextVariables: empty object should be treated as null for consistency
  let contextVariables = params.contextVariables;
  if (
    contextVariables !== undefined &&
    contextVariables !== null &&
    typeof contextVariables === 'object' &&
    Object.keys(contextVariables).length === 0
  ) {
    contextVariables = null;
  }

  const contextConfig = await db
    .insert(contextConfigs)
    .values({
      id,
      tenantId: params.tenantId,
      projectId: params.projectId,
      agentId: params.agentId,
      headersSchema: (params.headersSchema ?? null) as any,
      contextVariables: (contextVariables ?? null) as any,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return contextConfig[0];
};

export const updateContextConfig =
  (db: DatabaseClient) =>
  async (params: { scopes: AgentScopeConfig; id: string; data: Partial<ContextConfigUpdate> }) => {
    const now = new Date().toISOString();

    // Process the update data to handle null/empty object clearing
    const processedData = { ...params.data };

    // Handle contextVariables clearing: null or empty object should set to null for consistency
    if ('contextVariables' in params.data) {
      if (
        params.data.contextVariables === null ||
        (typeof params.data.contextVariables === 'object' &&
          params.data.contextVariables !== null &&
          Object.keys(params.data.contextVariables).length === 0)
      ) {
        processedData.contextVariables = null;
      }
    }

    // Handle headersSchema clearing: null should remain null
    if ('headersSchema' in params.data && params.data.headersSchema === null) {
      processedData.headersSchema = null;
    }

    const updated = await db
      .update(contextConfigs)
      .set({
        ...(processedData as any),
        updatedAt: now,
      })
      .where(
        and(
          eq(contextConfigs.tenantId, params.scopes.tenantId),
          eq(contextConfigs.projectId, params.scopes.projectId),
          eq(contextConfigs.agentId, params.scopes.agentId),
          eq(contextConfigs.id, params.id)
        )
      )
      .returning();

    return updated[0];
  };

export const deleteContextConfig =
  (db: DatabaseClient) =>
  async (params: { scopes: AgentScopeConfig; id: string }): Promise<boolean> => {
    try {
      const result = await db
        .delete(contextConfigs)
        .where(
          and(
            eq(contextConfigs.tenantId, params.scopes.tenantId),
            eq(contextConfigs.projectId, params.scopes.projectId),
            eq(contextConfigs.agentId, params.scopes.agentId),
            eq(contextConfigs.id, params.id)
          )
        )
        .returning();

      return result.length > 0;
    } catch (error) {
      console.error('Error deleting context config:', error);
      return false;
    }
  };

export const hasContextConfig =
  (db: DatabaseClient) =>
  async (params: { scopes: AgentScopeConfig; id: string }): Promise<boolean> => {
    const contextConfig = await getContextConfigById(db)(params);
    return contextConfig !== null;
  };

export const countContextConfigs =
  (db: DatabaseClient) =>
  async (params: { scopes: AgentScopeConfig }): Promise<number> => {
    const result = await db
      .select({ count: count() })
      .from(contextConfigs)
      .where(
        and(
          eq(contextConfigs.tenantId, params.scopes.tenantId),
          eq(contextConfigs.projectId, params.scopes.projectId),
          eq(contextConfigs.agentId, params.scopes.agentId)
        )
      );

    const total = result[0]?.count || 0;
    return typeof total === 'string' ? Number.parseInt(total, 10) : (total as number);
  };

/**
 * Upsert a context config (create if it doesn't exist, update if it does)
 */
export const upsertContextConfig =
  (db: DatabaseClient) => async (params: { data: ContextConfigInsert }) => {
    const scopes = {
      tenantId: params.data.tenantId,
      projectId: params.data.projectId,
      agentId: params.data.agentId,
    };

    // If an ID is provided, check if it exists
    if (params.data.id) {
      const existing = await getContextConfigById(db)({
        scopes,
        id: params.data.id,
      });

      if (existing) {
        return await updateContextConfig(db)({
          scopes,
          id: params.data.id,
          data: {
            headersSchema: params.data.headersSchema,
            contextVariables: params.data.contextVariables,
          },
        });
      }
    }

    return await createContextConfig(db)(params.data);
  };
