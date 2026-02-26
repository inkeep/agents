import { and, count, desc, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import type { AgentsManageDatabaseClient } from '../../db/manage/manage-client';
import {
  externalAgents,
  subAgentExternalAgentRelations,
  subAgents,
} from '../../db/manage/manage-schema';
import type { SubAgentExternalAgentRelationInsert } from '../../types/entities';
import type { AgentScopeConfig, PaginationConfig, SubAgentScopeConfig } from '../../types/utility';
import { agentScopedWhere, subAgentScopedWhere } from './scope-helpers';

export const getSubAgentExternalAgentRelationById =
  (db: AgentsManageDatabaseClient) =>
  async (params: { scopes: SubAgentScopeConfig; relationId: string }) => {
    return db.query.subAgentExternalAgentRelations.findFirst({
      where: and(
        subAgentScopedWhere(subAgentExternalAgentRelations, params.scopes),
        eq(subAgentExternalAgentRelations.id, params.relationId)
      ),
    });
  };

export const listSubAgentExternalAgentRelations =
  (db: AgentsManageDatabaseClient) =>
  async (params: { scopes: SubAgentScopeConfig; pagination?: PaginationConfig }) => {
    const page = params.pagination?.page || 1;
    const limit = Math.min(params.pagination?.limit || 10, 100);
    const offset = (page - 1) * limit;

    const whereClause = subAgentScopedWhere(subAgentExternalAgentRelations, params.scopes);

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
  (db: AgentsManageDatabaseClient) => async (params: { scopes: SubAgentScopeConfig }) => {
    return await db.query.subAgentExternalAgentRelations.findMany({
      where: subAgentScopedWhere(subAgentExternalAgentRelations, params.scopes),
    });
  };

export const getSubAgentExternalAgentRelationsByAgent =
  (db: AgentsManageDatabaseClient) => async (params: { scopes: AgentScopeConfig }) => {
    return await db.query.subAgentExternalAgentRelations.findMany({
      where: agentScopedWhere(subAgentExternalAgentRelations, params.scopes),
    });
  };

export const getSubAgentExternalAgentRelationsByExternalAgent =
  (db: AgentsManageDatabaseClient) =>
  async (params: {
    scopes: AgentScopeConfig;
    externalAgentId: string;
    pagination?: PaginationConfig;
  }) => {
    const page = params.pagination?.page || 1;
    const limit = Math.min(params.pagination?.limit || 10, 100);
    const offset = (page - 1) * limit;

    const whereClause = and(
      agentScopedWhere(subAgentExternalAgentRelations, params.scopes),
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
  (db: AgentsManageDatabaseClient) =>
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
        .where(subAgentScopedWhere(subAgentExternalAgentRelations, params.scopes))
        .limit(limit)
        .offset(offset)
        .orderBy(desc(subAgentExternalAgentRelations.createdAt)),
      db
        .select({ count: count() })
        .from(subAgentExternalAgentRelations)
        .where(subAgentScopedWhere(subAgentExternalAgentRelations, params.scopes)),
    ]);

    const total = totalResult[0]?.count || 0;
    const pages = Math.ceil(total / limit);

    return {
      data,
      pagination: { page, limit, total, pages },
    };
  };

export const getSubAgentsForExternalAgent =
  (db: AgentsManageDatabaseClient) =>
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
            agentScopedWhere(subAgentExternalAgentRelations, params.scopes),
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
            agentScopedWhere(subAgentExternalAgentRelations, params.scopes),
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
  (db: AgentsManageDatabaseClient) =>
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
  (db: AgentsManageDatabaseClient) =>
  async (params: { scopes: SubAgentScopeConfig; externalAgentId: string }) => {
    return db.query.subAgentExternalAgentRelations.findFirst({
      where: and(
        subAgentScopedWhere(subAgentExternalAgentRelations, params.scopes),
        eq(subAgentExternalAgentRelations.externalAgentId, params.externalAgentId)
      ),
    });
  };

/**
 * Upsert sub-agent external agent relation (create if it doesn't exist, update if it does)
 */
export const upsertSubAgentExternalAgentRelation =
  (db: AgentsManageDatabaseClient) =>
  async (params: {
    scopes: SubAgentScopeConfig;
    relationId?: string;
    data: {
      externalAgentId: string;
      headers?: Record<string, string> | null;
    };
  }) => {
    // If relationId provided, try to update existing relation
    if (params.relationId) {
      return await updateSubAgentExternalAgentRelation(db)({
        scopes: params.scopes,
        relationId: params.relationId,
        data: params.data,
      });
    }

    // Check if relation already exists by params
    const existing = await getSubAgentExternalAgentRelationByParams(db)({
      scopes: params.scopes,
      externalAgentId: params.data.externalAgentId,
    });

    if (existing) {
      return await updateSubAgentExternalAgentRelation(db)({
        scopes: params.scopes,
        relationId: existing.id,
        data: params.data,
      });
    }

    // Create new relation
    return await createSubAgentExternalAgentRelation(db)(params);
  };

export const updateSubAgentExternalAgentRelation =
  (db: AgentsManageDatabaseClient) =>
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
          subAgentScopedWhere(subAgentExternalAgentRelations, params.scopes),
          eq(subAgentExternalAgentRelations.id, params.relationId)
        )
      )
      .returning();

    return relation[0];
  };

export const deleteSubAgentExternalAgentRelation =
  (db: AgentsManageDatabaseClient) =>
  async (params: { scopes: SubAgentScopeConfig; relationId: string }) => {
    const result = await db
      .delete(subAgentExternalAgentRelations)
      .where(
        and(
          subAgentScopedWhere(subAgentExternalAgentRelations, params.scopes),
          eq(subAgentExternalAgentRelations.id, params.relationId)
        )
      )
      .returning();

    return result.length > 0;
  };

export const deleteSubAgentExternalAgentRelationsBySubAgent =
  (db: AgentsManageDatabaseClient) => async (params: { scopes: SubAgentScopeConfig }) => {
    const result = await db
      .delete(subAgentExternalAgentRelations)
      .where(subAgentScopedWhere(subAgentExternalAgentRelations, params.scopes))
      .returning();
    return result.length > 0;
  };

export const deleteSubAgentExternalAgentRelationsByAgent =
  (db: AgentsManageDatabaseClient) => async (params: { scopes: AgentScopeConfig }) => {
    const result = await db
      .delete(subAgentExternalAgentRelations)
      .where(agentScopedWhere(subAgentExternalAgentRelations, params.scopes))
      .returning();
    return result.length > 0;
  };
