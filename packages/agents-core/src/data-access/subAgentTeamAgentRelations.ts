import { and, count, desc, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import type { DatabaseClient } from '../db/client';
import { agents, subAgents, subAgentTeamAgentRelations } from '../db/schema';
import type { SubAgentTeamAgentRelationInsert } from '../types/entities';
import type { AgentScopeConfig, PaginationConfig, SubAgentScopeConfig } from '../types/utility';

export const getSubAgentTeamAgentRelationById =
  (db: DatabaseClient) => async (params: { scopes: SubAgentScopeConfig; relationId: string }) => {
    return db.query.subAgentTeamAgentRelations.findFirst({
      where: and(
        eq(subAgentTeamAgentRelations.tenantId, params.scopes.tenantId),
        eq(subAgentTeamAgentRelations.projectId, params.scopes.projectId),
        eq(subAgentTeamAgentRelations.agentId, params.scopes.agentId),
        eq(subAgentTeamAgentRelations.subAgentId, params.scopes.subAgentId),
        eq(subAgentTeamAgentRelations.id, params.relationId)
      ),
    });
  };

export const listSubAgentTeamAgentRelations =
  (db: DatabaseClient) =>
  async (params: { scopes: SubAgentScopeConfig; pagination?: PaginationConfig }) => {
    const page = params.pagination?.page || 1;
    const limit = Math.min(params.pagination?.limit || 10, 100);
    const offset = (page - 1) * limit;

    const whereClause = and(
      eq(subAgentTeamAgentRelations.tenantId, params.scopes.tenantId),
      eq(subAgentTeamAgentRelations.projectId, params.scopes.projectId),
      eq(subAgentTeamAgentRelations.agentId, params.scopes.agentId),
      eq(subAgentTeamAgentRelations.subAgentId, params.scopes.subAgentId)
    );

    const [data, totalResult] = await Promise.all([
      db
        .select()
        .from(subAgentTeamAgentRelations)
        .where(whereClause)
        .limit(limit)
        .offset(offset)
        .orderBy(desc(subAgentTeamAgentRelations.createdAt)),
      db.select({ count: count() }).from(subAgentTeamAgentRelations).where(whereClause),
    ]);

    const total = totalResult[0]?.count || 0;
    const pages = Math.ceil(total / limit);

    return { data, pagination: { page, limit, total, pages } };
  };

export const getSubAgentTeamAgentRelations =
  (db: DatabaseClient) => async (params: { scopes: SubAgentScopeConfig }) => {
    return await db.query.subAgentTeamAgentRelations.findMany({
      where: and(
        eq(subAgentTeamAgentRelations.tenantId, params.scopes.tenantId),
        eq(subAgentTeamAgentRelations.projectId, params.scopes.projectId),
        eq(subAgentTeamAgentRelations.agentId, params.scopes.agentId),
        eq(subAgentTeamAgentRelations.subAgentId, params.scopes.subAgentId)
      ),
    });
  };

export const getSubAgentTeamAgentRelationsByAgent =
  (db: DatabaseClient) => async (params: { scopes: AgentScopeConfig }) => {
    return await db.query.subAgentTeamAgentRelations.findMany({
      where: and(
        eq(subAgentTeamAgentRelations.tenantId, params.scopes.tenantId),
        eq(subAgentTeamAgentRelations.projectId, params.scopes.projectId),
        eq(subAgentTeamAgentRelations.agentId, params.scopes.agentId)
      ),
    });
  };

export const getSubAgentTeamAgentRelationsByTeamAgent =
  (db: DatabaseClient) =>
  async (params: {
    scopes: AgentScopeConfig;
    targetAgentId: string;
    pagination?: PaginationConfig;
  }) => {
    const page = params.pagination?.page || 1;
    const limit = Math.min(params.pagination?.limit || 10, 100);
    const offset = (page - 1) * limit;

    const whereClause = and(
      eq(subAgentTeamAgentRelations.tenantId, params.scopes.tenantId),
      eq(subAgentTeamAgentRelations.projectId, params.scopes.projectId),
      eq(subAgentTeamAgentRelations.agentId, params.scopes.agentId),
      eq(subAgentTeamAgentRelations.targetAgentId, params.targetAgentId)
    );

    const [data, totalResult] = await Promise.all([
      db
        .select()
        .from(subAgentTeamAgentRelations)
        .where(whereClause)
        .limit(limit)
        .offset(offset)
        .orderBy(desc(subAgentTeamAgentRelations.createdAt)),
      db.select({ count: count() }).from(subAgentTeamAgentRelations).where(whereClause),
    ]);

    const total = totalResult[0]?.count || 0;
    const pages = Math.ceil(total / limit);

    return {
      data,
      pagination: { page, limit, total, pages },
    };
  };

export const getTeamAgentsForSubAgent =
  (db: DatabaseClient) =>
  async (params: { scopes: SubAgentScopeConfig; pagination?: PaginationConfig }) => {
    const page = params.pagination?.page || 1;
    const limit = Math.min(params.pagination?.limit || 10, 100);
    const offset = (page - 1) * limit;

    const [data, totalResult] = await Promise.all([
      db
        .select({
          id: subAgentTeamAgentRelations.id,
          tenantId: subAgentTeamAgentRelations.tenantId,
          projectId: subAgentTeamAgentRelations.projectId,
          agentId: subAgentTeamAgentRelations.agentId,
          subAgentId: subAgentTeamAgentRelations.subAgentId,
          targetAgentId: subAgentTeamAgentRelations.targetAgentId,
          headers: subAgentTeamAgentRelations.headers,
          createdAt: subAgentTeamAgentRelations.createdAt,
          updatedAt: subAgentTeamAgentRelations.updatedAt,
          targetAgent: {
            id: agents.id,
            name: agents.name,
            description: agents.description,
            defaultSubAgentId: agents.defaultSubAgentId,
            contextConfigId: agents.contextConfigId,
            models: agents.models,
            statusUpdates: agents.statusUpdates,
            prompt: agents.prompt,
            stopWhen: agents.stopWhen,
            createdAt: agents.createdAt,
            updatedAt: agents.updatedAt,
          },
        })
        .from(subAgentTeamAgentRelations)
        .innerJoin(
          agents,
          and(
            eq(subAgentTeamAgentRelations.tenantId, agents.tenantId),
            eq(subAgentTeamAgentRelations.projectId, agents.projectId),
            eq(subAgentTeamAgentRelations.targetAgentId, agents.id)
          )
        )
        .where(
          and(
            eq(subAgentTeamAgentRelations.tenantId, params.scopes.tenantId),
            eq(subAgentTeamAgentRelations.projectId, params.scopes.projectId),
            eq(subAgentTeamAgentRelations.agentId, params.scopes.agentId),
            eq(subAgentTeamAgentRelations.subAgentId, params.scopes.subAgentId)
          )
        )
        .limit(limit)
        .offset(offset)
        .orderBy(desc(subAgentTeamAgentRelations.createdAt)),
      db
        .select({ count: count() })
        .from(subAgentTeamAgentRelations)
        .where(
          and(
            eq(subAgentTeamAgentRelations.tenantId, params.scopes.tenantId),
            eq(subAgentTeamAgentRelations.projectId, params.scopes.projectId),
            eq(subAgentTeamAgentRelations.agentId, params.scopes.agentId),
            eq(subAgentTeamAgentRelations.subAgentId, params.scopes.subAgentId)
          )
        ),
    ]);

    const total = totalResult[0]?.count || 0;
    const pages = Math.ceil(total / limit);

    return {
      data,
      pagination: { page, limit, total, pages },
    };
  };

export const getSubAgentsForTeamAgent =
  (db: DatabaseClient) =>
  async (params: {
    scopes: AgentScopeConfig;
    targetAgentId: string;
    pagination?: PaginationConfig;
  }) => {
    const page = params.pagination?.page || 1;
    const limit = Math.min(params.pagination?.limit || 10, 100);
    const offset = (page - 1) * limit;

    const [data, totalResult] = await Promise.all([
      db
        .select({
          id: subAgentTeamAgentRelations.id,
          tenantId: subAgentTeamAgentRelations.tenantId,
          projectId: subAgentTeamAgentRelations.projectId,
          agentId: subAgentTeamAgentRelations.agentId,
          subAgentId: subAgentTeamAgentRelations.subAgentId,
          targetAgentId: subAgentTeamAgentRelations.targetAgentId,
          createdAt: subAgentTeamAgentRelations.createdAt,
          updatedAt: subAgentTeamAgentRelations.updatedAt,
          subAgent: {
            id: subAgents.id,
            name: subAgents.name,
            description: subAgents.description,
            prompt: subAgents.prompt,
            conversationHistoryConfig: subAgents.conversationHistoryConfig,
            models: subAgents.models,
            stopWhen: subAgents.stopWhen,
            createdAt: subAgents.createdAt,
            updatedAt: subAgents.updatedAt,
          },
        })
        .from(subAgentTeamAgentRelations)
        .innerJoin(
          subAgents,
          and(
            eq(subAgentTeamAgentRelations.subAgentId, subAgents.id),
            eq(subAgentTeamAgentRelations.tenantId, subAgents.tenantId),
            eq(subAgentTeamAgentRelations.projectId, subAgents.projectId),
            eq(subAgentTeamAgentRelations.agentId, subAgents.agentId)
          )
        )
        .where(
          and(
            eq(subAgentTeamAgentRelations.tenantId, params.scopes.tenantId),
            eq(subAgentTeamAgentRelations.projectId, params.scopes.projectId),
            eq(subAgentTeamAgentRelations.agentId, params.scopes.agentId),
            eq(subAgentTeamAgentRelations.targetAgentId, params.targetAgentId)
          )
        )
        .limit(limit)
        .offset(offset)
        .orderBy(desc(subAgentTeamAgentRelations.createdAt)),
      db
        .select({ count: count() })
        .from(subAgentTeamAgentRelations)
        .where(
          and(
            eq(subAgentTeamAgentRelations.tenantId, params.scopes.tenantId),
            eq(subAgentTeamAgentRelations.projectId, params.scopes.projectId),
            eq(subAgentTeamAgentRelations.agentId, params.scopes.agentId),
            eq(subAgentTeamAgentRelations.targetAgentId, params.targetAgentId)
          )
        ),
    ]);

    const total = totalResult[0]?.count || 0;
    const pages = Math.ceil(total / limit);

    return {
      data,
      pagination: { page, limit, total, pages },
    };
  };

export const createSubAgentTeamAgentRelation =
  (db: DatabaseClient) =>
  async (params: {
    scopes: SubAgentScopeConfig;
    relationId?: string;
    data: {
      targetAgentId: string;
      headers?: Record<string, string> | null;
    };
  }) => {
    const finalRelationId = params.relationId ?? nanoid();

    const relation = await db
      .insert(subAgentTeamAgentRelations)
      .values({
        id: finalRelationId,
        tenantId: params.scopes.tenantId,
        projectId: params.scopes.projectId,
        agentId: params.scopes.agentId,
        subAgentId: params.scopes.subAgentId,
        targetAgentId: params.data.targetAgentId,
        headers: params.data.headers,
      })
      .returning();

    return relation[0];
  };

/**
 * Check if sub-agent team agent relation exists by params
 */
export const getSubAgentTeamAgentRelationByParams =
  (db: DatabaseClient) =>
  async (params: { scopes: SubAgentScopeConfig; targetAgentId: string }) => {
    return db.query.subAgentTeamAgentRelations.findFirst({
      where: and(
        eq(subAgentTeamAgentRelations.tenantId, params.scopes.tenantId),
        eq(subAgentTeamAgentRelations.projectId, params.scopes.projectId),
        eq(subAgentTeamAgentRelations.agentId, params.scopes.agentId),
        eq(subAgentTeamAgentRelations.subAgentId, params.scopes.subAgentId),
        eq(subAgentTeamAgentRelations.targetAgentId, params.targetAgentId)
      ),
    });
  };

/**
 * Upsert sub-agent team agent relation (create if it doesn't exist, update if it does)
 */
export const upsertSubAgentTeamAgentRelation =
  (db: DatabaseClient) =>
  async (params: {
    scopes: SubAgentScopeConfig;
    relationId?: string;
    data: {
      targetAgentId: string;
      headers?: Record<string, string> | null;
    };
  }) => {
    // If relationId provided, try to update existing relation
    if (params.relationId) {
      return await updateSubAgentTeamAgentRelation(db)({
        scopes: params.scopes,
        relationId: params.relationId,
        data: params.data,
      });
    }

    // Check if relation already exists by params
    const existing = await getSubAgentTeamAgentRelationByParams(db)({
      scopes: params.scopes,
      targetAgentId: params.data.targetAgentId,
    });

    if (existing) {
      return await updateSubAgentTeamAgentRelation(db)({
        scopes: params.scopes,
        relationId: existing.id,
        data: params.data,
      });
    }

    // Create new relation
    return await createSubAgentTeamAgentRelation(db)(params);
  };

export const updateSubAgentTeamAgentRelation =
  (db: DatabaseClient) =>
  async (params: {
    scopes: SubAgentScopeConfig;
    relationId: string;
    data: Partial<SubAgentTeamAgentRelationInsert>;
  }) => {
    const updateData = {
      ...params.data,
      updatedAt: new Date().toISOString(),
    };

    const relation = await db
      .update(subAgentTeamAgentRelations)
      .set(updateData)
      .where(
        and(
          eq(subAgentTeamAgentRelations.tenantId, params.scopes.tenantId),
          eq(subAgentTeamAgentRelations.projectId, params.scopes.projectId),
          eq(subAgentTeamAgentRelations.agentId, params.scopes.agentId),
          eq(subAgentTeamAgentRelations.subAgentId, params.scopes.subAgentId),
          eq(subAgentTeamAgentRelations.id, params.relationId)
        )
      )
      .returning();

    return relation[0];
  };

export const deleteSubAgentTeamAgentRelation =
  (db: DatabaseClient) => async (params: { scopes: SubAgentScopeConfig; relationId: string }) => {
    const result = await db
      .delete(subAgentTeamAgentRelations)
      .where(
        and(
          eq(subAgentTeamAgentRelations.tenantId, params.scopes.tenantId),
          eq(subAgentTeamAgentRelations.projectId, params.scopes.projectId),
          eq(subAgentTeamAgentRelations.agentId, params.scopes.agentId),
          eq(subAgentTeamAgentRelations.subAgentId, params.scopes.subAgentId),
          eq(subAgentTeamAgentRelations.id, params.relationId)
        )
      )
      .returning();

    return result.length > 0;
  };

export const deleteSubAgentTeamAgentRelationsBySubAgent =
  (db: DatabaseClient) => async (params: { scopes: SubAgentScopeConfig }) => {
    const result = await db
      .delete(subAgentTeamAgentRelations)
      .where(
        and(
          eq(subAgentTeamAgentRelations.tenantId, params.scopes.tenantId),
          eq(subAgentTeamAgentRelations.projectId, params.scopes.projectId),
          eq(subAgentTeamAgentRelations.agentId, params.scopes.agentId),
          eq(subAgentTeamAgentRelations.subAgentId, params.scopes.subAgentId)
        )
      )
      .returning();
    return result.length > 0;
  };

export const deleteSubAgentTeamAgentRelationsByAgent =
  (db: DatabaseClient) => async (params: { scopes: AgentScopeConfig }) => {
    const result = await db
      .delete(subAgentTeamAgentRelations)
      .where(
        and(
          eq(subAgentTeamAgentRelations.tenantId, params.scopes.tenantId),
          eq(subAgentTeamAgentRelations.projectId, params.scopes.projectId),
          eq(subAgentTeamAgentRelations.agentId, params.scopes.agentId)
        )
      )
      .returning();
    return result.length > 0;
  };
