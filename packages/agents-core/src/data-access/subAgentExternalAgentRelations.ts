import { and, count, desc, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import type { DatabaseClient } from '../db/client';
import { externalAgents, subAgentExternalAgentRelations, subAgents } from '../db/schema';
import type { SubAgentExternalAgentRelationInsert } from '../types/entities';
import type { AgentScopeConfig, PaginationConfig, SubAgentScopeConfig } from '../types/utility';

export const getSubAgentExternalAgentRelationById =
  (db: DatabaseClient) => async (params: { scopes: SubAgentScopeConfig; relationId: string }) => {
    return db.query.subAgentExternalAgentRelations.findFirst({
      where: and(
        eq(subAgentExternalAgentRelations.tenantId, params.scopes.tenantId),
        eq(subAgentExternalAgentRelations.projectId, params.scopes.projectId),
        eq(subAgentExternalAgentRelations.agentId, params.scopes.agentId),
        eq(subAgentExternalAgentRelations.subAgentId, params.scopes.subAgentId),
        eq(subAgentExternalAgentRelations.id, params.relationId)
      ),
    });
  };

export const listSubAgentExternalAgentRelations =
  (db: DatabaseClient) =>
  async (params: { scopes: SubAgentScopeConfig; pagination?: PaginationConfig }) => {
    const page = params.pagination?.page || 1;
    const limit = Math.min(params.pagination?.limit || 10, 100);
    const offset = (page - 1) * limit;

    const whereClause = and(
      eq(subAgentExternalAgentRelations.tenantId, params.scopes.tenantId),
      eq(subAgentExternalAgentRelations.projectId, params.scopes.projectId),
      eq(subAgentExternalAgentRelations.agentId, params.scopes.agentId),
      eq(subAgentExternalAgentRelations.subAgentId, params.scopes.subAgentId)
    );

    const [data, totalResult] = await Promise.all([
      db
        .select()
        .from(subAgentExternalAgentRelations)
        .where(whereClause)
        .limit(limit)
        .offset(offset)
        .orderBy(desc(subAgentExternalAgentRelations.createdAt)),
      db.select({ count: count() }).from(subAgentExternalAgentRelations).where(whereClause),
    ]);

    const total = totalResult[0]?.count || 0;
    const pages = Math.ceil(total / limit);

    return { data, pagination: { page, limit, total, pages } };
  };

export const getSubAgentExternalAgentRelations =
  (db: DatabaseClient) => async (params: { scopes: SubAgentScopeConfig }) => {
    return await db.query.subAgentExternalAgentRelations.findMany({
      where: and(
        eq(subAgentExternalAgentRelations.tenantId, params.scopes.tenantId),
        eq(subAgentExternalAgentRelations.projectId, params.scopes.projectId),
        eq(subAgentExternalAgentRelations.agentId, params.scopes.agentId),
        eq(subAgentExternalAgentRelations.subAgentId, params.scopes.subAgentId)
      ),
    });
  };

export const getSubAgentExternalAgentRelationsByAgent =
  (db: DatabaseClient) => async (params: { scopes: AgentScopeConfig }) => {
    return await db.query.subAgentExternalAgentRelations.findMany({
      where: and(
        eq(subAgentExternalAgentRelations.tenantId, params.scopes.tenantId),
        eq(subAgentExternalAgentRelations.projectId, params.scopes.projectId),
        eq(subAgentExternalAgentRelations.agentId, params.scopes.agentId)
      ),
    });
  };

export const getSubAgentExternalAgentRelationsByExternalAgent =
  (db: DatabaseClient) =>
  async (params: {
    scopes: AgentScopeConfig;
    externalAgentId: string;
    pagination?: PaginationConfig;
  }) => {
    const page = params.pagination?.page || 1;
    const limit = Math.min(params.pagination?.limit || 10, 100);
    const offset = (page - 1) * limit;

    const whereClause = and(
      eq(subAgentExternalAgentRelations.tenantId, params.scopes.tenantId),
      eq(subAgentExternalAgentRelations.projectId, params.scopes.projectId),
      eq(subAgentExternalAgentRelations.agentId, params.scopes.agentId),
      eq(subAgentExternalAgentRelations.externalAgentId, params.externalAgentId)
    );

    const [data, totalResult] = await Promise.all([
      db
        .select()
        .from(subAgentExternalAgentRelations)
        .where(whereClause)
        .limit(limit)
        .offset(offset)
        .orderBy(desc(subAgentExternalAgentRelations.createdAt)),
      db.select({ count: count() }).from(subAgentExternalAgentRelations).where(whereClause),
    ]);

    const total = totalResult[0]?.count || 0;
    const pages = Math.ceil(total / limit);

    return {
      data,
      pagination: { page, limit, total, pages },
    };
  };

export const getExternalAgentsForSubAgent =
  (db: DatabaseClient) =>
  async (params: { scopes: SubAgentScopeConfig; pagination?: PaginationConfig }) => {
    const page = params.pagination?.page || 1;
    const limit = Math.min(params.pagination?.limit || 10, 100);
    const offset = (page - 1) * limit;

    const [data, totalResult] = await Promise.all([
      db
        .select({
          id: subAgentExternalAgentRelations.id,
          tenantId: subAgentExternalAgentRelations.tenantId,
          projectId: subAgentExternalAgentRelations.projectId,
          agentId: subAgentExternalAgentRelations.agentId,
          subAgentId: subAgentExternalAgentRelations.subAgentId,
          externalAgentId: subAgentExternalAgentRelations.externalAgentId,
          headers: subAgentExternalAgentRelations.headers,
          createdAt: subAgentExternalAgentRelations.createdAt,
          updatedAt: subAgentExternalAgentRelations.updatedAt,
          externalAgent: {
            id: externalAgents.id,
            name: externalAgents.name,
            description: externalAgents.description,
            baseUrl: externalAgents.baseUrl,
            credentialReferenceId: externalAgents.credentialReferenceId,
            tenantId: externalAgents.tenantId,
            projectId: externalAgents.projectId,
            createdAt: externalAgents.createdAt,
            updatedAt: externalAgents.updatedAt,
          },
        })
        .from(subAgentExternalAgentRelations)
        .innerJoin(
          externalAgents,
          and(
            eq(subAgentExternalAgentRelations.tenantId, externalAgents.tenantId),
            eq(subAgentExternalAgentRelations.projectId, externalAgents.projectId),
            eq(subAgentExternalAgentRelations.externalAgentId, externalAgents.id)
          )
        )
        .where(
          and(
            eq(subAgentExternalAgentRelations.tenantId, params.scopes.tenantId),
            eq(subAgentExternalAgentRelations.projectId, params.scopes.projectId),
            eq(subAgentExternalAgentRelations.agentId, params.scopes.agentId),
            eq(subAgentExternalAgentRelations.subAgentId, params.scopes.subAgentId)
          )
        )
        .limit(limit)
        .offset(offset)
        .orderBy(desc(subAgentExternalAgentRelations.createdAt)),
      db
        .select({ count: count() })
        .from(subAgentExternalAgentRelations)
        .where(
          and(
            eq(subAgentExternalAgentRelations.tenantId, params.scopes.tenantId),
            eq(subAgentExternalAgentRelations.projectId, params.scopes.projectId),
            eq(subAgentExternalAgentRelations.agentId, params.scopes.agentId),
            eq(subAgentExternalAgentRelations.subAgentId, params.scopes.subAgentId)
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

export const getSubAgentsForExternalAgent =
  (db: DatabaseClient) =>
  async (params: {
    scopes: AgentScopeConfig;
    externalAgentId: string;
    pagination?: PaginationConfig;
  }) => {
    const page = params.pagination?.page || 1;
    const limit = Math.min(params.pagination?.limit || 10, 100);
    const offset = (page - 1) * limit;

    const [data, totalResult] = await Promise.all([
      db
        .select({
          id: subAgentExternalAgentRelations.id,
          tenantId: subAgentExternalAgentRelations.tenantId,
          projectId: subAgentExternalAgentRelations.projectId,
          agentId: subAgentExternalAgentRelations.agentId,
          subAgentId: subAgentExternalAgentRelations.subAgentId,
          externalAgentId: subAgentExternalAgentRelations.externalAgentId,
          headers: subAgentExternalAgentRelations.headers,
          createdAt: subAgentExternalAgentRelations.createdAt,
          updatedAt: subAgentExternalAgentRelations.updatedAt,
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
        .from(subAgentExternalAgentRelations)
        .innerJoin(
          subAgents,
          and(
            eq(subAgentExternalAgentRelations.subAgentId, subAgents.id),
            eq(subAgentExternalAgentRelations.tenantId, subAgents.tenantId),
            eq(subAgentExternalAgentRelations.projectId, subAgents.projectId),
            eq(subAgentExternalAgentRelations.agentId, subAgents.agentId)
          )
        )
        .where(
          and(
            eq(subAgentExternalAgentRelations.tenantId, params.scopes.tenantId),
            eq(subAgentExternalAgentRelations.projectId, params.scopes.projectId),
            eq(subAgentExternalAgentRelations.agentId, params.scopes.agentId),
            eq(subAgentExternalAgentRelations.externalAgentId, params.externalAgentId)
          )
        )
        .limit(limit)
        .offset(offset)
        .orderBy(desc(subAgentExternalAgentRelations.createdAt)),
      db
        .select({ count: count() })
        .from(subAgentExternalAgentRelations)
        .where(
          and(
            eq(subAgentExternalAgentRelations.tenantId, params.scopes.tenantId),
            eq(subAgentExternalAgentRelations.projectId, params.scopes.projectId),
            eq(subAgentExternalAgentRelations.agentId, params.scopes.agentId),
            eq(subAgentExternalAgentRelations.externalAgentId, params.externalAgentId)
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

export const createSubAgentExternalAgentRelation =
  (db: DatabaseClient) =>
  async (params: {
    scopes: SubAgentScopeConfig;
    relationId?: string;
    data: {
      externalAgentId: string;
      headers?: Record<string, string> | null;
    };
  }) => {
    const finalRelationId = params.relationId ?? nanoid();

    const relation = await db
      .insert(subAgentExternalAgentRelations)
      .values({
        id: finalRelationId,
        tenantId: params.scopes.tenantId,
        projectId: params.scopes.projectId,
        agentId: params.scopes.agentId,
        subAgentId: params.scopes.subAgentId,
        externalAgentId: params.data.externalAgentId,
        headers: params.data.headers,
      })
      .returning();

    return relation[0];
  };

/**
 * Check if sub-agent external agent relation exists by params
 */
export const getSubAgentExternalAgentRelationByParams =
  (db: DatabaseClient) =>
  async (params: { scopes: SubAgentScopeConfig; externalAgentId: string }) => {
    return db.query.subAgentExternalAgentRelations.findFirst({
      where: and(
        eq(subAgentExternalAgentRelations.tenantId, params.scopes.tenantId),
        eq(subAgentExternalAgentRelations.projectId, params.scopes.projectId),
        eq(subAgentExternalAgentRelations.agentId, params.scopes.agentId),
        eq(subAgentExternalAgentRelations.subAgentId, params.scopes.subAgentId),
        eq(subAgentExternalAgentRelations.externalAgentId, params.externalAgentId)
      ),
    });
  };

/**
 * Upsert sub-agent external agent relation (create if it doesn't exist, no-op if it does)
 */
export const upsertSubAgentExternalAgentRelation =
  (db: DatabaseClient) =>
  async (params: {
    scopes: SubAgentScopeConfig;
    data: {
      externalAgentId: string;
      headers?: Record<string, string> | null;
    };
  }) => {
    const existing = await getSubAgentExternalAgentRelationByParams(db)({
      scopes: params.scopes,
      externalAgentId: params.data.externalAgentId,
    });

    if (!existing) {
      return await createSubAgentExternalAgentRelation(db)(params);
    }

    return existing;
  };

export const updateSubAgentExternalAgentRelation =
  (db: DatabaseClient) =>
  async (params: {
    scopes: SubAgentScopeConfig;
    relationId: string;
    data: Partial<SubAgentExternalAgentRelationInsert>;
  }) => {
    const updateData = {
      ...params.data,
      updatedAt: new Date().toISOString(),
    };

    const relation = await db
      .update(subAgentExternalAgentRelations)
      .set(updateData)
      .where(
        and(
          eq(subAgentExternalAgentRelations.tenantId, params.scopes.tenantId),
          eq(subAgentExternalAgentRelations.projectId, params.scopes.projectId),
          eq(subAgentExternalAgentRelations.agentId, params.scopes.agentId),
          eq(subAgentExternalAgentRelations.subAgentId, params.scopes.subAgentId),
          eq(subAgentExternalAgentRelations.id, params.relationId)
        )
      )
      .returning();

    return relation[0];
  };

export const deleteSubAgentExternalAgentRelation =
  (db: DatabaseClient) => async (params: { scopes: SubAgentScopeConfig; relationId: string }) => {
    const result = await db
      .delete(subAgentExternalAgentRelations)
      .where(
        and(
          eq(subAgentExternalAgentRelations.tenantId, params.scopes.tenantId),
          eq(subAgentExternalAgentRelations.projectId, params.scopes.projectId),
          eq(subAgentExternalAgentRelations.agentId, params.scopes.agentId),
          eq(subAgentExternalAgentRelations.subAgentId, params.scopes.subAgentId),
          eq(subAgentExternalAgentRelations.id, params.relationId)
        )
      );

    return (result.rowsAffected || 0) > 0;
  };

export const deleteSubAgentExternalAgentRelationsBySubAgent =
  (db: DatabaseClient) => async (params: { scopes: SubAgentScopeConfig }) => {
    const result = await db
      .delete(subAgentExternalAgentRelations)
      .where(
        and(
          eq(subAgentExternalAgentRelations.tenantId, params.scopes.tenantId),
          eq(subAgentExternalAgentRelations.projectId, params.scopes.projectId),
          eq(subAgentExternalAgentRelations.agentId, params.scopes.agentId),
          eq(subAgentExternalAgentRelations.subAgentId, params.scopes.subAgentId)
        )
      );
    return (result.rowsAffected || 0) > 0;
  };

export const deleteSubAgentExternalAgentRelationsByAgent =
  (db: DatabaseClient) => async (params: { scopes: AgentScopeConfig }) => {
    const result = await db
      .delete(subAgentExternalAgentRelations)
      .where(
        and(
          eq(subAgentExternalAgentRelations.tenantId, params.scopes.tenantId),
          eq(subAgentExternalAgentRelations.projectId, params.scopes.projectId),
          eq(subAgentExternalAgentRelations.agentId, params.scopes.agentId)
        )
      );
    return (result.rowsAffected || 0) > 0;
  };
