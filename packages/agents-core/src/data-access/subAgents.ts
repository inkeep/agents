import { and, count, desc, eq, inArray } from 'drizzle-orm';
import type { DatabaseClient } from '../db/client';
import { subAgents } from '../db/schema';
import type { SubAgentInsert, SubAgentSelect, SubAgentUpdate } from '../types/entities';
import type { AgentScopeConfig, PaginationConfig } from '../types/utility';

export const getSubAgentById =
  (db: DatabaseClient) => async (params: { scopes: AgentScopeConfig; subAgentId: string }) => {
    const result = await db.query.subAgents.findFirst({
      where: and(
        eq(subAgents.tenantId, params.scopes.tenantId),
        eq(subAgents.projectId, params.scopes.projectId),
        eq(subAgents.agentId, params.scopes.agentId),
        eq(subAgents.id, params.subAgentId)
      ),
    });
    return result;
  };

export const listSubAgents =
  (db: DatabaseClient) => async (params: { scopes: AgentScopeConfig }) => {
    return await db.query.subAgents.findMany({
      where: and(
        eq(subAgents.tenantId, params.scopes.tenantId),
        eq(subAgents.projectId, params.scopes.projectId),
        eq(subAgents.agentId, params.scopes.agentId)
      ),
    });
  };

export const listSubAgentsPaginated =
  (db: DatabaseClient) =>
  async (params: { scopes: AgentScopeConfig; pagination?: PaginationConfig }) => {
    const page = params.pagination?.page || 1;
    const limit = Math.min(params.pagination?.limit || 10, 100);
    const offset = (page - 1) * limit;

    const whereClause = and(
      eq(subAgents.tenantId, params.scopes.tenantId),
      eq(subAgents.projectId, params.scopes.projectId),
      eq(subAgents.agentId, params.scopes.agentId)
    );

    const [data, totalResult] = await Promise.all([
      db
        .select()
        .from(subAgents)
        .where(whereClause)
        .limit(limit)
        .offset(offset)
        .orderBy(desc(subAgents.createdAt)),
      db.select({ count: count() }).from(subAgents).where(whereClause),
    ]);

    const total = totalResult[0]?.count || 0;
    const pages = Math.ceil(total / limit);

    return {
      data,
      pagination: { page, limit, total, pages },
    };
  };

export const createSubAgent = (db: DatabaseClient) => async (params: SubAgentInsert) => {
  const agent = await db.insert(subAgents).values(params).returning();

  return agent[0];
};

export const updateSubAgent =
  (db: DatabaseClient) =>
  async (params: { scopes: AgentScopeConfig; subAgentId: string; data: SubAgentUpdate }) => {
    const data = params.data;

    // Handle model settings clearing - if empty object with no meaningful values, set to null
    if (data.models !== undefined) {
      if (
        !data.models ||
        (!data.models.base?.model &&
          !data.models.structuredOutput?.model &&
          !data.models.summarizer?.model &&
          !data.models.base?.providerOptions &&
          !data.models.structuredOutput?.providerOptions &&
          !data.models.summarizer?.providerOptions)
      ) {
        (data as any).models = null;
      }
    }

    const updateData = {
      ...data,
      updatedAt: new Date().toISOString(),
    } as SubAgentUpdate;

    const agent = await db
      .update(subAgents)
      .set(updateData)
      .where(
        and(
          eq(subAgents.tenantId, params.scopes.tenantId),
          eq(subAgents.projectId, params.scopes.projectId),
          eq(subAgents.agentId, params.scopes.agentId),
          eq(subAgents.id, params.subAgentId)
        )
      )
      .returning();

    return agent[0] ?? null;
  };

/**
 * Upsert agent (create if it doesn't exist, update if it does)
 */
export const upsertSubAgent =
  (db: DatabaseClient) =>
  async (params: { data: SubAgentInsert }): Promise<SubAgentSelect> => {
    const scopes = {
      tenantId: params.data.tenantId,
      projectId: params.data.projectId,
      agentId: params.data.agentId,
    };

    const existing = await getSubAgentById(db)({
      scopes,
      subAgentId: params.data.id,
    });

    if (existing) {
      const updated = await updateSubAgent(db)({
        scopes,
        subAgentId: params.data.id,
        data: {
          name: params.data.name,
          description: params.data.description,
          prompt: params.data.prompt,
          conversationHistoryConfig: params.data.conversationHistoryConfig,
          models: params.data.models,
          stopWhen: params.data.stopWhen,
        },
      });
      if (!updated) {
        throw new Error('Failed to update agent - no rows affected');
      }
      return updated;
    }
    return await createSubAgent(db)(params.data);
  };

export const deleteSubAgent =
  (db: DatabaseClient) => async (params: { scopes: AgentScopeConfig; subAgentId: string }) => {
    await db
      .delete(subAgents)
      .where(
        and(
          eq(subAgents.tenantId, params.scopes.tenantId),
          eq(subAgents.projectId, params.scopes.projectId),
          eq(subAgents.agentId, params.scopes.agentId),
          eq(subAgents.id, params.subAgentId)
        )
      );

    const deletedSubAgent = await getSubAgentById(db)({
      scopes: params.scopes,
      subAgentId: params.subAgentId,
    });
    return deletedSubAgent === undefined;
  };

export const getSubAgentsByIds =
  (db: DatabaseClient) => async (params: { scopes: AgentScopeConfig; subAgentIds: string[] }) => {
    if (params.subAgentIds.length === 0) {
      return [];
    }

    return await db
      .select()
      .from(subAgents)
      .where(
        and(
          eq(subAgents.tenantId, params.scopes.tenantId),
          eq(subAgents.projectId, params.scopes.projectId),
          eq(subAgents.agentId, params.scopes.agentId),
          inArray(subAgents.id, params.subAgentIds)
        )
      );
  };
