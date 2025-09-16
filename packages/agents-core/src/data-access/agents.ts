import { and, count, desc, eq, inArray } from 'drizzle-orm';
import type { DatabaseClient } from '../db/client';
import { agents } from '../db/schema';
import type { AgentInsert, AgentSelect, AgentUpdate } from '../types/entities';
import type { GraphScopeConfig, PaginationConfig } from '../types/utility';

export const getAgentById =
  (db: DatabaseClient) => async (params: { scopes: GraphScopeConfig; agentId: string }) => {
    const result = await db.query.agents.findFirst({
      where: and(
        eq(agents.tenantId, params.scopes.tenantId),
        eq(agents.projectId, params.scopes.projectId),
        eq(agents.graphId, params.scopes.graphId),
        eq(agents.id, params.agentId)
      ),
    });
    return result;
  };

export const listAgents = (db: DatabaseClient) => async (params: { scopes: GraphScopeConfig }) => {
  return await db.query.agents.findMany({
    where: and(
      eq(agents.tenantId, params.scopes.tenantId),
      eq(agents.projectId, params.scopes.projectId),
      eq(agents.graphId, params.scopes.graphId)
    ),
  });
};

export const listAgentsPaginated =
  (db: DatabaseClient) =>
  async (params: { scopes: GraphScopeConfig; pagination?: PaginationConfig }) => {
    const page = params.pagination?.page || 1;
    const limit = Math.min(params.pagination?.limit || 10, 100);
    const offset = (page - 1) * limit;

    const whereClause = and(
      eq(agents.tenantId, params.scopes.tenantId),
      eq(agents.projectId, params.scopes.projectId),
      eq(agents.graphId, params.scopes.graphId)
    );

    const [data, totalResult] = await Promise.all([
      db
        .select()
        .from(agents)
        .where(whereClause)
        .limit(limit)
        .offset(offset)
        .orderBy(desc(agents.createdAt)),
      db.select({ count: count() }).from(agents).where(whereClause),
    ]);

    const total = totalResult[0]?.count || 0;
    const pages = Math.ceil(total / limit);

    return {
      data,
      pagination: { page, limit, total, pages },
    };
  };

export const createAgent = (db: DatabaseClient) => async (params: AgentInsert) => {
  const agent = await db.insert(agents).values(params).returning();

  return agent[0];
};

export const updateAgent =
  (db: DatabaseClient) =>
  async (params: { scopes: GraphScopeConfig; agentId: string; data: AgentUpdate }) => {
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
    } as AgentUpdate;

    const agent = await db
      .update(agents)
      .set(updateData)
      .where(
        and(
          eq(agents.tenantId, params.scopes.tenantId),
          eq(agents.projectId, params.scopes.projectId),
          eq(agents.graphId, params.scopes.graphId),
          eq(agents.id, params.agentId)
        )
      )
      .returning();

    return agent[0] ?? null;
  };

/**
 * Upsert agent (create if it doesn't exist, update if it does)
 */
export const upsertAgent =
  (db: DatabaseClient) =>
  async (params: { data: AgentInsert }): Promise<AgentSelect> => {
    const scopes = {
      tenantId: params.data.tenantId,
      projectId: params.data.projectId,
      graphId: params.data.graphId,
    };

    const existing = await getAgentById(db)({
      scopes,
      agentId: params.data.id,
    });

    if (existing) {
      // Update existing agent
      const updated = await updateAgent(db)({
        scopes,
        agentId: params.data.id,
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
    } else {
      // Create new agent
      return await createAgent(db)(params.data);
    }
  };

export const deleteAgent =
  (db: DatabaseClient) => async (params: { scopes: GraphScopeConfig; agentId: string }) => {
    await db
      .delete(agents)
      .where(
        and(
          eq(agents.tenantId, params.scopes.tenantId),
          eq(agents.projectId, params.scopes.projectId),
          eq(agents.graphId, params.scopes.graphId),
          eq(agents.id, params.agentId)
        )
      );

    // Check if agent still exists to confirm deletion
    const deletedAgent = await getAgentById(db)({
      scopes: params.scopes,
      agentId: params.agentId,
    });
    return deletedAgent === undefined;
  };

export const getAgentsByIds =
  (db: DatabaseClient) => async (params: { scopes: GraphScopeConfig; agentIds: string[] }) => {
    if (params.agentIds.length === 0) {
      return [];
    }

    return await db
      .select()
      .from(agents)
      .where(
        and(
          eq(agents.tenantId, params.scopes.tenantId),
          eq(agents.projectId, params.scopes.projectId),
          eq(agents.graphId, params.scopes.graphId),
          inArray(agents.id, params.agentIds)
        )
      );
  };
