import { and, count, desc, eq, isNotNull } from 'drizzle-orm';
import type { DatabaseClient } from '../db/client';
import { subAgentRelations, subAgents, subAgentToolRelations, tools } from '../db/schema';
import type {
  SubAgentRelationInsert,
  SubAgentRelationUpdate,
  SubAgentToolRelationUpdate,
} from '../types/entities';
import type { AgentScopeConfig, PaginationConfig, SubAgentScopeConfig } from '../types/utility';
import { generateId } from '../utils/conversations';

export const getAgentRelationById =
  (db: DatabaseClient) => async (params: { scopes: AgentScopeConfig; relationId: string }) => {
    return db.query.subAgentRelations.findFirst({
      where: and(
        eq(subAgentRelations.tenantId, params.scopes.tenantId),
        eq(subAgentRelations.projectId, params.scopes.projectId),
        eq(subAgentRelations.agentId, params.scopes.agentId),
        eq(subAgentRelations.id, params.relationId)
      ),
    });
  };

export const listAgentRelations =
  (db: DatabaseClient) =>
  async (params: { scopes: AgentScopeConfig; pagination?: PaginationConfig }) => {
    const page = params.pagination?.page || 1;
    const limit = Math.min(params.pagination?.limit || 10, 100);
    const offset = (page - 1) * limit;

    const whereClause = and(
      eq(subAgentRelations.tenantId, params.scopes.tenantId),
      eq(subAgentRelations.projectId, params.scopes.projectId),
      eq(subAgentRelations.agentId, params.scopes.agentId)
    );

    const [data, totalResult] = await Promise.all([
      db
        .select()
        .from(subAgentRelations)
        .where(whereClause)
        .limit(limit)
        .offset(offset)
        .orderBy(desc(subAgentRelations.createdAt)),
      db.select({ count: count() }).from(subAgentRelations).where(whereClause),
    ]);

    const total = totalResult[0]?.count || 0;
    const pages = Math.ceil(total / limit);

    return { data, pagination: { page, limit, total, pages } };
  };

export const getAgentRelations =
  (db: DatabaseClient) => async (params: { scopes: SubAgentScopeConfig }) => {
    return await db.query.subAgentRelations.findMany({
      where: and(
        eq(subAgentRelations.tenantId, params.scopes.tenantId),
        eq(subAgentRelations.projectId, params.scopes.projectId),
        eq(subAgentRelations.agentId, params.scopes.agentId),
        eq(subAgentRelations.sourceSubAgentId, params.scopes.subAgentId)
      ),
    });
  };

export const getAgentRelationsByAgent =
  (db: DatabaseClient) => async (params: { scopes: AgentScopeConfig }) => {
    return await db.query.subAgentRelations.findMany({
      where: and(
        eq(subAgentRelations.tenantId, params.scopes.tenantId),
        eq(subAgentRelations.projectId, params.scopes.projectId),
        eq(subAgentRelations.agentId, params.scopes.agentId)
      ),
    });
  };

export const getAgentRelationsBySource =
  (db: DatabaseClient) =>
  async (params: {
    scopes: AgentScopeConfig;
    sourceSubAgentId: string;
    pagination?: PaginationConfig;
  }) => {
    const page = params.pagination?.page || 1;
    const limit = Math.min(params.pagination?.limit || 10, 100);
    const offset = (page - 1) * limit;

    const whereClause = and(
      eq(subAgentRelations.tenantId, params.scopes.tenantId),
      eq(subAgentRelations.projectId, params.scopes.projectId),
      eq(subAgentRelations.agentId, params.scopes.agentId),
      eq(subAgentRelations.sourceSubAgentId, params.sourceSubAgentId)
    );

    const [data, totalResult] = await Promise.all([
      db
        .select()
        .from(subAgentRelations)
        .where(whereClause)
        .limit(limit)
        .offset(offset)
        .orderBy(desc(subAgentRelations.createdAt)),
      db.select({ count: count() }).from(subAgentRelations).where(whereClause),
    ]);

    const total = totalResult[0]?.count || 0;
    const pages = Math.ceil(total / limit);

    return {
      data,
      pagination: { page, limit, total, pages },
    };
  };

export const getSubAgentRelationsByTarget =
  (db: DatabaseClient) =>
  async (params: {
    scopes: AgentScopeConfig;
    targetSubAgentId: string;
    pagination?: PaginationConfig;
  }) => {
    const page = params.pagination?.page || 1;
    const limit = Math.min(params.pagination?.limit || 10, 100);
    const offset = (page - 1) * limit;

    const whereClause = and(
      eq(subAgentRelations.tenantId, params.scopes.tenantId),
      eq(subAgentRelations.projectId, params.scopes.projectId),
      eq(subAgentRelations.agentId, params.scopes.agentId),
      eq(subAgentRelations.targetSubAgentId, params.targetSubAgentId)
    );

    const [data, totalResult] = await Promise.all([
      db
        .select()
        .from(subAgentRelations)
        .where(whereClause)
        .limit(limit)
        .offset(offset)
        .orderBy(desc(subAgentRelations.createdAt)),
      db.select({ count: count() }).from(subAgentRelations).where(whereClause),
    ]);

    const total = totalResult[0]?.count || 0;
    const pages = Math.ceil(total / limit);

    return {
      data,
      pagination: { page, limit, total, pages },
    };
  };

export const getRelatedAgentsForAgent =
  (db: DatabaseClient) => async (params: { scopes: AgentScopeConfig; subAgentId: string }) => {
    const data = await db
      .select({
        id: subAgents.id,
        name: subAgents.name,
        description: subAgents.description,
        relationType: subAgentRelations.relationType,
      })
      .from(subAgentRelations)
      .innerJoin(
        subAgents,
        and(
          eq(subAgentRelations.targetSubAgentId, subAgents.id),
          eq(subAgentRelations.tenantId, subAgents.tenantId),
          eq(subAgentRelations.projectId, subAgents.projectId),
          eq(subAgentRelations.agentId, subAgents.agentId)
        )
      )
      .where(
        and(
          eq(subAgentRelations.tenantId, params.scopes.tenantId),
          eq(subAgentRelations.projectId, params.scopes.projectId),
          eq(subAgentRelations.agentId, params.scopes.agentId),
          eq(subAgentRelations.sourceSubAgentId, params.subAgentId),
          isNotNull(subAgentRelations.targetSubAgentId)
        )
      );

    return {
      data,
    };
  };

export const createSubAgentRelation =
  (db: DatabaseClient) => async (params: SubAgentRelationInsert) => {
    const hasTargetAgent = params.targetSubAgentId != null;
    const hasExternalAgent = params.externalSubAgentId != null;
    const hasTeamAgent = params.teamSubAgentId != null;
    const count = [hasTargetAgent, hasExternalAgent, hasTeamAgent].filter(Boolean).length;

    if (count > 1) {
      throw new Error(
        'Cannot specify more than one of targetSubAgentId, externalSubAgentId, or teamSubAgentId'
      );
    }

    if (count === 0) {
      throw new Error(
        'Must specify exactly one of targetSubAgentId, externalSubAgentId, or teamSubAgentId'
      );
    }

    const relation = await db
      .insert(subAgentRelations)
      .values({
        ...params,
      })
      .returning();

    return relation[0];
  };

/**
 * Check if sub-agent relation exists by agent, source, target, and relation type
 */
export const getAgentRelationByParams =
  (db: DatabaseClient) =>
  async (params: {
    scopes: AgentScopeConfig;
    sourceSubAgentId: string;
    targetSubAgentId?: string;
    relationType: string;
  }) => {
    const whereConditions = [
      eq(subAgentRelations.tenantId, params.scopes.tenantId),
      eq(subAgentRelations.projectId, params.scopes.projectId),
      eq(subAgentRelations.agentId, params.scopes.agentId),
      eq(subAgentRelations.sourceSubAgentId, params.sourceSubAgentId),
      eq(subAgentRelations.relationType, params.relationType),
    ];

    if (params.targetSubAgentId) {
      whereConditions.push(eq(subAgentRelations.targetSubAgentId, params.targetSubAgentId));
    }

    return db.query.subAgentRelations.findFirst({
      where: and(...whereConditions),
    });
  };

/**
 * Upsert agent relation (create if it doesn't exist, no-op if it does)
 */
export const upsertSubAgentRelation =
  (db: DatabaseClient) => async (params: SubAgentRelationInsert) => {
    const existing = await getAgentRelationByParams(db)({
      scopes: { tenantId: params.tenantId, projectId: params.projectId, agentId: params.agentId },
      sourceSubAgentId: params.sourceSubAgentId,
      targetSubAgentId: params.targetSubAgentId,
      relationType: params.relationType ?? '',
    });

    if (!existing) {
      return await createSubAgentRelation(db)(params);
    }

    return existing;
  };

export const updateAgentRelation =
  (db: DatabaseClient) =>
  async (params: {
    scopes: AgentScopeConfig;
    relationId: string;
    data: SubAgentRelationUpdate;
  }) => {
    const updateData = {
      ...params.data,
      updatedAt: new Date().toISOString(),
    };

    const relation = await db
      .update(subAgentRelations)
      .set(updateData)
      .where(
        and(
          eq(subAgentRelations.tenantId, params.scopes.tenantId),
          eq(subAgentRelations.projectId, params.scopes.projectId),
          eq(subAgentRelations.agentId, params.scopes.agentId),
          eq(subAgentRelations.id, params.relationId)
        )
      )
      .returning();

    return relation[0];
  };

export const deleteSubAgentRelation =
  (db: DatabaseClient) => async (params: { scopes: AgentScopeConfig; relationId: string }) => {
    const result = await db
      .delete(subAgentRelations)
      .where(
        and(
          eq(subAgentRelations.tenantId, params.scopes.tenantId),
          eq(subAgentRelations.projectId, params.scopes.projectId),
          eq(subAgentRelations.agentId, params.scopes.agentId),
          eq(subAgentRelations.id, params.relationId)
        )
      )
      .returning();

    return result.length > 0;
  };

export const deleteAgentRelationsByAgent =
  (db: DatabaseClient) => async (params: { scopes: AgentScopeConfig }) => {
    const result = await db
      .delete(subAgentRelations)
      .where(
        and(
          eq(subAgentRelations.tenantId, params.scopes.tenantId),
          eq(subAgentRelations.agentId, params.scopes.agentId)
        )
      )
      .returning();
    return result.length > 0;
  };

export const createAgentToolRelation =
  (db: DatabaseClient) =>
  async (params: {
    scopes: AgentScopeConfig;
    relationId?: string;
    data: {
      subAgentId: string;
      toolId: string;
      selectedTools?: string[] | null;
      headers?: Record<string, string> | null;
    };
  }) => {
    const finalRelationId = params.relationId ?? generateId();

    const relation = await db
      .insert(subAgentToolRelations)
      .values({
        id: finalRelationId,
        tenantId: params.scopes.tenantId,
        projectId: params.scopes.projectId,
        agentId: params.scopes.agentId,
        subAgentId: params.data.subAgentId,
        toolId: params.data.toolId,
        selectedTools: params.data.selectedTools,
        headers: params.data.headers,
      })
      .returning();

    return relation[0];
  };

export const updateAgentToolRelation =
  (db: DatabaseClient) =>
  async (params: {
    scopes: AgentScopeConfig;
    relationId: string;
    data: SubAgentToolRelationUpdate;
  }) => {
    const updateData = {
      ...params.data,
      updatedAt: new Date().toISOString(),
    };

    const relation = await db
      .update(subAgentToolRelations)
      .set(updateData)
      .where(
        and(
          eq(subAgentToolRelations.tenantId, params.scopes.tenantId),
          eq(subAgentToolRelations.projectId, params.scopes.projectId),
          eq(subAgentToolRelations.agentId, params.scopes.agentId),
          eq(subAgentToolRelations.id, params.relationId)
        )
      )
      .returning();

    return relation[0];
  };

export const deleteAgentToolRelation =
  (db: DatabaseClient) => async (params: { scopes: AgentScopeConfig; relationId: string }) => {
    const result = await db
      .delete(subAgentToolRelations)
      .where(
        and(
          eq(subAgentToolRelations.tenantId, params.scopes.tenantId),
          eq(subAgentToolRelations.projectId, params.scopes.projectId),
          eq(subAgentToolRelations.agentId, params.scopes.agentId),
          eq(subAgentToolRelations.id, params.relationId)
        )
      )
      .returning();

    return result.length > 0;
  };

export const deleteAgentToolRelationByAgent =
  (db: DatabaseClient) => async (params: { scopes: SubAgentScopeConfig }) => {
    const result = await db
      .delete(subAgentToolRelations)
      .where(
        and(
          eq(subAgentToolRelations.tenantId, params.scopes.tenantId),
          eq(subAgentToolRelations.projectId, params.scopes.projectId),
          eq(subAgentToolRelations.agentId, params.scopes.agentId),
          eq(subAgentToolRelations.subAgentId, params.scopes.subAgentId)
        )
      )
      .returning();
    return result.length > 0;
  };

export const getAgentToolRelationById =
  (db: DatabaseClient) => async (params: { scopes: SubAgentScopeConfig; relationId: string }) => {
    return await db.query.subAgentToolRelations.findFirst({
      where: and(
        eq(subAgentToolRelations.tenantId, params.scopes.tenantId),
        eq(subAgentToolRelations.projectId, params.scopes.projectId),
        eq(subAgentToolRelations.agentId, params.scopes.agentId),
        eq(subAgentToolRelations.id, params.relationId)
      ),
    });
  };

export const getAgentToolRelationByAgent =
  (db: DatabaseClient) =>
  async (params: { scopes: SubAgentScopeConfig; pagination?: PaginationConfig }) => {
    const page = params.pagination?.page || 1;
    const limit = Math.min(params.pagination?.limit || 10, 100);
    const offset = (page - 1) * limit;

    const [data, totalResult] = await Promise.all([
      db
        .select()
        .from(subAgentToolRelations)
        .where(
          and(
            eq(subAgentToolRelations.tenantId, params.scopes.tenantId),
            eq(subAgentToolRelations.projectId, params.scopes.projectId),
            eq(subAgentToolRelations.subAgentId, params.scopes.subAgentId)
          )
        )
        .limit(limit)
        .offset(offset)
        .orderBy(desc(subAgentToolRelations.createdAt)),
      db
        .select({ count: count() })
        .from(subAgentToolRelations)
        .where(
          and(
            eq(subAgentToolRelations.tenantId, params.scopes.tenantId),
            eq(subAgentToolRelations.projectId, params.scopes.projectId),
            eq(subAgentToolRelations.subAgentId, params.scopes.subAgentId)
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

export const getAgentToolRelationByTool =
  (db: DatabaseClient) =>
  async (params: { scopes: AgentScopeConfig; toolId: string; pagination?: PaginationConfig }) => {
    const page = params.pagination?.page || 1;
    const limit = Math.min(params.pagination?.limit || 10, 100);
    const offset = (page - 1) * limit;

    const [data, totalResult] = await Promise.all([
      db
        .select()
        .from(subAgentToolRelations)
        .where(
          and(
            eq(subAgentToolRelations.tenantId, params.scopes.tenantId),
            eq(subAgentToolRelations.projectId, params.scopes.projectId),
            eq(subAgentToolRelations.agentId, params.scopes.agentId),
            eq(subAgentToolRelations.toolId, params.toolId)
          )
        )
        .limit(limit)
        .offset(offset)
        .orderBy(desc(subAgentToolRelations.createdAt)),
      db
        .select({ count: count() })
        .from(subAgentToolRelations)
        .where(
          and(
            eq(subAgentToolRelations.tenantId, params.scopes.tenantId),
            eq(subAgentToolRelations.projectId, params.scopes.projectId),
            eq(subAgentToolRelations.agentId, params.scopes.agentId),
            eq(subAgentToolRelations.toolId, params.toolId)
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

export const listAgentToolRelations =
  (db: DatabaseClient) =>
  async (params: { scopes: AgentScopeConfig; pagination?: PaginationConfig }) => {
    const page = params.pagination?.page || 1;
    const limit = Math.min(params.pagination?.limit || 10, 100);
    const offset = (page - 1) * limit;
    const [data, totalResult] = await Promise.all([
      db
        .select()
        .from(subAgentToolRelations)
        .where(
          and(
            eq(subAgentToolRelations.tenantId, params.scopes.tenantId),
            eq(subAgentToolRelations.projectId, params.scopes.projectId),
            eq(subAgentToolRelations.agentId, params.scopes.agentId)
          )
        )
        .limit(limit)
        .offset(offset)
        .orderBy(desc(subAgentToolRelations.createdAt)),
      db
        .select({ count: count() })
        .from(subAgentToolRelations)
        .where(
          and(
            eq(subAgentToolRelations.tenantId, params.scopes.tenantId),
            eq(subAgentToolRelations.projectId, params.scopes.projectId),
            eq(subAgentToolRelations.agentId, params.scopes.agentId)
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

export const getToolsForAgent =
  (db: DatabaseClient) =>
  async (params: { scopes: SubAgentScopeConfig; pagination?: PaginationConfig }) => {
    const page = params.pagination?.page || 1;
    const limit = Math.min(params.pagination?.limit || 10, 100);
    const offset = (page - 1) * limit;

    const [data, totalResult] = await Promise.all([
      db
        .select({
          id: subAgentToolRelations.id,
          tenantId: subAgentToolRelations.tenantId,
          subAgentId: subAgentToolRelations.subAgentId,
          toolId: subAgentToolRelations.toolId,
          selectedTools: subAgentToolRelations.selectedTools,
          headers: subAgentToolRelations.headers,
          createdAt: subAgentToolRelations.createdAt,
          updatedAt: subAgentToolRelations.updatedAt,
          tool: {
            id: tools.id,
            name: tools.name,
            description: tools.description,
            config: tools.config,
            createdAt: tools.createdAt,
            updatedAt: tools.updatedAt,
            capabilities: tools.capabilities,
            lastError: tools.lastError,
            credentialReferenceId: tools.credentialReferenceId,
            tenantId: tools.tenantId,
            projectId: tools.projectId,
            headers: tools.headers,
            imageUrl: tools.imageUrl,
          },
        })
        .from(subAgentToolRelations)
        .innerJoin(
          tools,
          and(
            eq(subAgentToolRelations.tenantId, tools.tenantId),
            eq(subAgentToolRelations.projectId, tools.projectId),
            eq(subAgentToolRelations.toolId, tools.id)
          )
        )
        .where(
          and(
            eq(subAgentToolRelations.tenantId, params.scopes.tenantId),
            eq(subAgentToolRelations.projectId, params.scopes.projectId),
            eq(subAgentToolRelations.agentId, params.scopes.agentId),
            eq(subAgentToolRelations.subAgentId, params.scopes.subAgentId)
          )
        )
        .limit(limit)
        .offset(offset)
        .orderBy(desc(subAgentToolRelations.createdAt)),
      db
        .select({ count: count() })
        .from(subAgentToolRelations)
        .where(
          and(
            eq(subAgentToolRelations.tenantId, params.scopes.tenantId),
            eq(subAgentToolRelations.projectId, params.scopes.projectId),
            eq(subAgentToolRelations.agentId, params.scopes.agentId),
            eq(subAgentToolRelations.subAgentId, params.scopes.subAgentId)
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

export const getAgentsForTool =
  (db: DatabaseClient) =>
  async (params: { scopes: AgentScopeConfig; toolId: string; pagination?: PaginationConfig }) => {
    const page = params.pagination?.page || 1;
    const limit = Math.min(params.pagination?.limit || 10, 100);
    const offset = (page - 1) * limit;

    const [data, totalResult] = await Promise.all([
      db
        .select({
          id: subAgentToolRelations.id,
          tenantId: subAgentToolRelations.tenantId,
          subAgentId: subAgentToolRelations.subAgentId,
          toolId: subAgentToolRelations.toolId,
          selectedTools: subAgentToolRelations.selectedTools,
          headers: subAgentToolRelations.headers,
          createdAt: subAgentToolRelations.createdAt,
          updatedAt: subAgentToolRelations.updatedAt,
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
        .from(subAgentToolRelations)
        .innerJoin(
          subAgents,
          and(
            eq(subAgentToolRelations.subAgentId, subAgents.id),
            eq(subAgentToolRelations.tenantId, subAgents.tenantId),
            eq(subAgentToolRelations.projectId, subAgents.projectId),
            eq(subAgentToolRelations.agentId, subAgents.agentId)
          )
        )
        .where(
          and(
            eq(subAgentToolRelations.tenantId, params.scopes.tenantId),
            eq(subAgentToolRelations.projectId, params.scopes.projectId),
            eq(subAgentToolRelations.agentId, params.scopes.agentId),
            eq(subAgentToolRelations.toolId, params.toolId)
          )
        )
        .limit(limit)
        .offset(offset)
        .orderBy(desc(subAgentToolRelations.createdAt)),
      db
        .select({ count: count() })
        .from(subAgentToolRelations)
        .where(
          and(
            eq(subAgentToolRelations.tenantId, params.scopes.tenantId),
            eq(subAgentToolRelations.projectId, params.scopes.projectId),
            eq(subAgentToolRelations.agentId, params.scopes.agentId),
            eq(subAgentToolRelations.toolId, params.toolId)
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

export const validateSubAgent =
  (db: DatabaseClient) => async (params: { scopes: SubAgentScopeConfig }) => {
    const result = await db
      .select({ id: subAgents.id })
      .from(subAgents)
      .where(
        and(
          eq(subAgents.tenantId, params.scopes.tenantId),
          eq(subAgents.projectId, params.scopes.projectId),
          eq(subAgents.agentId, params.scopes.agentId),
          eq(subAgents.id, params.scopes.subAgentId)
        )
      )
      .limit(1);

    return result.length > 0;
  };
