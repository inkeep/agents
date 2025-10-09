import { and, count, desc, eq, isNotNull } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import type { DatabaseClient } from '../db/client';
import {
  externalAgents,
  subAgentRelations,
  subAgents,
  subAgentToolRelations,
  tools,
} from '../db/schema';
import type {
  AgentRelationInsert,
  AgentRelationUpdate,
  AgentToolRelationUpdate,
  ExternalAgentRelationInsert,
} from '../types/entities';
import type { AgentScopeConfig, GraphScopeConfig, PaginationConfig } from '../types/utility';

export const getAgentRelationById =
  (db: DatabaseClient) => async (params: { scopes: GraphScopeConfig; relationId: string }) => {
    return db.query.subAgentRelations.findFirst({
      where: and(
        eq(subAgentRelations.tenantId, params.scopes.tenantId),
        eq(subAgentRelations.projectId, params.scopes.projectId),
        eq(subAgentRelations.graphId, params.scopes.graphId),
        eq(subAgentRelations.id, params.relationId)
      ),
    });
  };

export const listAgentRelations =
  (db: DatabaseClient) =>
  async (params: { scopes: GraphScopeConfig; pagination?: PaginationConfig }) => {
    const page = params.pagination?.page || 1;
    const limit = Math.min(params.pagination?.limit || 10, 100);
    const offset = (page - 1) * limit;

    const whereClause = and(
      eq(subAgentRelations.tenantId, params.scopes.tenantId),
      eq(subAgentRelations.projectId, params.scopes.projectId),
      eq(subAgentRelations.graphId, params.scopes.graphId)
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
  (db: DatabaseClient) => async (params: { scopes: AgentScopeConfig }) => {
    return await db.query.subAgentRelations.findMany({
      where: and(
        eq(subAgentRelations.tenantId, params.scopes.tenantId),
        eq(subAgentRelations.projectId, params.scopes.projectId),
        eq(subAgentRelations.graphId, params.scopes.graphId),
        eq(subAgentRelations.sourceSubAgentId, params.scopes.subAgentId)
      ),
    });
  };

export const getAgentRelationsByGraph =
  (db: DatabaseClient) => async (params: { scopes: GraphScopeConfig }) => {
    return await db.query.subAgentRelations.findMany({
      where: and(
        eq(subAgentRelations.tenantId, params.scopes.tenantId),
        eq(subAgentRelations.projectId, params.scopes.projectId),
        eq(subAgentRelations.graphId, params.scopes.graphId)
      ),
    });
  };

export const getAgentRelationsBySource =
  (db: DatabaseClient) =>
  async (params: {
    scopes: GraphScopeConfig;
    sourceSubAgentId: string;
    pagination?: PaginationConfig;
  }) => {
    const page = params.pagination?.page || 1;
    const limit = Math.min(params.pagination?.limit || 10, 100);
    const offset = (page - 1) * limit;

    const whereClause = and(
      eq(subAgentRelations.tenantId, params.scopes.tenantId),
      eq(subAgentRelations.projectId, params.scopes.projectId),
      eq(subAgentRelations.graphId, params.scopes.graphId),
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

export const getAgentRelationsByTarget =
  (db: DatabaseClient) =>
  async (params: {
    scopes: GraphScopeConfig;
    targetSubAgentId: string;
    pagination?: PaginationConfig;
  }) => {
    const page = params.pagination?.page || 1;
    const limit = Math.min(params.pagination?.limit || 10, 100);
    const offset = (page - 1) * limit;

    const whereClause = and(
      eq(subAgentRelations.tenantId, params.scopes.tenantId),
      eq(subAgentRelations.projectId, params.scopes.projectId),
      eq(subAgentRelations.graphId, params.scopes.graphId),
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

export const getExternalAgentRelations =
  (db: DatabaseClient) =>
  async (params: {
    scopes: GraphScopeConfig;
    externalSubAgentId: string;
    pagination?: PaginationConfig;
  }) => {
    const page = params.pagination?.page || 1;
    const limit = Math.min(params.pagination?.limit || 10, 100);
    const offset = (page - 1) * limit;

    const whereClause = and(
      eq(subAgentRelations.tenantId, params.scopes.tenantId),
      eq(subAgentRelations.projectId, params.scopes.projectId),
      eq(subAgentRelations.graphId, params.scopes.graphId),
      eq(subAgentRelations.externalSubAgentId, params.externalSubAgentId)
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

// Get all related agents (both internal and external) for a given agent
export const getRelatedAgentsForGraph =
  (db: DatabaseClient) => async (params: { scopes: GraphScopeConfig; subAgentId: string }) => {
    // Get internal agent relations
    const internalRelations = await db
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
          eq(subAgentRelations.graphId, subAgents.graphId)
        )
      )
      .where(
        and(
          eq(subAgentRelations.tenantId, params.scopes.tenantId),
          eq(subAgentRelations.projectId, params.scopes.projectId),
          eq(subAgentRelations.graphId, params.scopes.graphId),
          eq(subAgentRelations.sourceSubAgentId, params.subAgentId),
          isNotNull(subAgentRelations.targetSubAgentId)
        )
      );

    // Get external agent relations
    const externalRelations = await db
      .select({
        id: subAgentRelations.id,
        relationType: subAgentRelations.relationType,
        externalAgent: {
          id: externalAgents.id,
          name: externalAgents.name,
          description: externalAgents.description,
          baseUrl: externalAgents.baseUrl,
        },
      })
      .from(subAgentRelations)
      .innerJoin(
        externalAgents,
        and(
          eq(subAgentRelations.externalSubAgentId, externalAgents.id),
          eq(subAgentRelations.tenantId, externalAgents.tenantId),
          eq(subAgentRelations.projectId, externalAgents.projectId),
          eq(subAgentRelations.graphId, externalAgents.graphId)
        )
      )
      .where(
        and(
          eq(subAgentRelations.tenantId, params.scopes.tenantId),
          eq(subAgentRelations.projectId, params.scopes.projectId),
          eq(subAgentRelations.graphId, params.scopes.graphId),
          eq(subAgentRelations.sourceSubAgentId, params.subAgentId),
          isNotNull(subAgentRelations.externalSubAgentId)
        )
      );

    // Return both types of relations separately
    return {
      internalRelations,
      externalRelations,
    };
  };

export const createSubAgentRelation =
  (db: DatabaseClient) => async (params: AgentRelationInsert) => {
    // Validate that exactly one of targetSubAgentId or externalSubAgentId is provided
    const hasTargetAgent = params.targetSubAgentId != null;
    const hasExternalAgent = params.externalSubAgentId != null;

    if (hasTargetAgent && hasExternalAgent) {
      throw new Error('Cannot specify both targetSubAgentId and externalSubAgentId');
    }

    if (!hasTargetAgent && !hasExternalAgent) {
      throw new Error('Must specify either targetSubAgentId or externalSubAgentId');
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
 * Check if agent relation exists by graph, source, target, and relation type
 */
export const getAgentRelationByParams =
  (db: DatabaseClient) =>
  async (params: {
    scopes: GraphScopeConfig;
    sourceSubAgentId: string;
    targetSubAgentId?: string;
    externalSubAgentId?: string;
    relationType: string;
  }) => {
    const whereConditions = [
      eq(subAgentRelations.tenantId, params.scopes.tenantId),
      eq(subAgentRelations.projectId, params.scopes.projectId),
      eq(subAgentRelations.graphId, params.scopes.graphId),
      eq(subAgentRelations.sourceSubAgentId, params.sourceSubAgentId),
      eq(subAgentRelations.relationType, params.relationType),
    ];

    if (params.targetSubAgentId) {
      whereConditions.push(eq(subAgentRelations.targetSubAgentId, params.targetSubAgentId));
    }

    if (params.externalSubAgentId) {
      whereConditions.push(eq(subAgentRelations.externalSubAgentId, params.externalSubAgentId));
    }

    return db.query.subAgentRelations.findFirst({
      where: and(...whereConditions),
    });
  };

/**
 * Upsert agent relation (create if it doesn't exist, no-op if it does)
 */
export const upsertAgentRelation = (db: DatabaseClient) => async (params: AgentRelationInsert) => {
  // Check if relation already exists
  const existing = await getAgentRelationByParams(db)({
    scopes: { tenantId: params.tenantId, projectId: params.projectId, graphId: params.graphId },
    sourceSubAgentId: params.sourceSubAgentId,
    targetSubAgentId: params.targetSubAgentId,
    externalSubAgentId: params.externalSubAgentId,
    relationType: params.relationType ?? '',
  });

  if (!existing) {
    // Create the relation if it doesn't exist
    return await createSubAgentRelation(db)(params);
  }

  // Return existing relation if it already exists
  return existing;
};

// Create external agent relation (convenience function)
export const createExternalAgentRelation =
  (db: DatabaseClient) => async (params: ExternalAgentRelationInsert) => {
    return await createSubAgentRelation(db)({
      ...params,
      targetSubAgentId: undefined,
    });
  };

export const updateAgentRelation =
  (db: DatabaseClient) =>
  async (params: { scopes: GraphScopeConfig; relationId: string; data: AgentRelationUpdate }) => {
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
          eq(subAgentRelations.graphId, params.scopes.graphId),
          eq(subAgentRelations.id, params.relationId)
        )
      )
      .returning();

    return relation[0];
  };

export const deleteSubAgentRelation =
  (db: DatabaseClient) => async (params: { scopes: GraphScopeConfig; relationId: string }) => {
    const result = await db
      .delete(subAgentRelations)
      .where(
        and(
          eq(subAgentRelations.tenantId, params.scopes.tenantId),
          eq(subAgentRelations.projectId, params.scopes.projectId),
          eq(subAgentRelations.graphId, params.scopes.graphId),
          eq(subAgentRelations.id, params.relationId)
        )
      );

    return (result.rowsAffected || 0) > 0;
  };

export const deleteAgentRelationsByGraph =
  (db: DatabaseClient) => async (params: { scopes: GraphScopeConfig }) => {
    const result = await db
      .delete(subAgentRelations)
      .where(
        and(
          eq(subAgentRelations.tenantId, params.scopes.tenantId),
          eq(subAgentRelations.graphId, params.scopes.graphId)
        )
      );
    return (result.rowsAffected || 0) > 0;
  };

// Create agent tool relation
export const createAgentToolRelation =
  (db: DatabaseClient) =>
  async (params: {
    scopes: GraphScopeConfig;
    relationId?: string;
    data: {
      subAgentId: string;
      toolId: string;
      selectedTools?: string[] | null;
      headers?: Record<string, string> | null;
    };
  }) => {
    const finalRelationId = params.relationId ?? nanoid();

    const relation = await db
      .insert(subAgentToolRelations)
      .values({
        id: finalRelationId,
        tenantId: params.scopes.tenantId,
        projectId: params.scopes.projectId,
        graphId: params.scopes.graphId,
        subAgentId: params.data.subAgentId,
        toolId: params.data.toolId,
        selectedTools: params.data.selectedTools,
        headers: params.data.headers,
      })
      .returning();

    return relation[0];
  };

// Update agent tool relation
export const updateAgentToolRelation =
  (db: DatabaseClient) =>
  async (params: {
    scopes: GraphScopeConfig;
    relationId: string;
    data: AgentToolRelationUpdate;
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
          eq(subAgentToolRelations.graphId, params.scopes.graphId),
          eq(subAgentToolRelations.id, params.relationId)
        )
      )
      .returning();

    return relation[0];
  };

// Delete agent tool relation
export const deleteAgentToolRelation =
  (db: DatabaseClient) => async (params: { scopes: GraphScopeConfig; relationId: string }) => {
    const result = await db
      .delete(subAgentToolRelations)
      .where(
        and(
          eq(subAgentToolRelations.tenantId, params.scopes.tenantId),
          eq(subAgentToolRelations.projectId, params.scopes.projectId),
          eq(subAgentToolRelations.graphId, params.scopes.graphId),
          eq(subAgentToolRelations.id, params.relationId)
        )
      );

    return (result.rowsAffected || 0) > 0;
  };

export const deleteAgentToolRelationByAgent =
  (db: DatabaseClient) => async (params: { scopes: AgentScopeConfig }) => {
    const result = await db
      .delete(subAgentToolRelations)
      .where(
        and(
          eq(subAgentToolRelations.tenantId, params.scopes.tenantId),
          eq(subAgentToolRelations.projectId, params.scopes.projectId),
          eq(subAgentToolRelations.graphId, params.scopes.graphId),
          eq(subAgentToolRelations.subAgentId, params.scopes.subAgentId)
        )
      );
    return (result.rowsAffected || 0) > 0;
  };

export const getAgentToolRelationById =
  (db: DatabaseClient) => async (params: { scopes: AgentScopeConfig; relationId: string }) => {
    return await db.query.subAgentToolRelations.findFirst({
      where: and(
        eq(subAgentToolRelations.tenantId, params.scopes.tenantId),
        eq(subAgentToolRelations.projectId, params.scopes.projectId),
        eq(subAgentToolRelations.graphId, params.scopes.graphId),
        eq(subAgentToolRelations.id, params.relationId)
      ),
    });
  };

export const getAgentToolRelationByAgent =
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
  async (params: { scopes: GraphScopeConfig; toolId: string; pagination?: PaginationConfig }) => {
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
            eq(subAgentToolRelations.graphId, params.scopes.graphId),
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
            eq(subAgentToolRelations.graphId, params.scopes.graphId),
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
  async (params: { scopes: GraphScopeConfig; pagination?: PaginationConfig }) => {
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
            eq(subAgentToolRelations.graphId, params.scopes.graphId)
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
            eq(subAgentToolRelations.graphId, params.scopes.graphId)
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

// Get tools for a specific agent
export const getToolsForAgent =
  (db: DatabaseClient) =>
  async (params: { scopes: AgentScopeConfig; pagination?: PaginationConfig }) => {
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
            eq(subAgentToolRelations.graphId, params.scopes.graphId),
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
            eq(subAgentToolRelations.graphId, params.scopes.graphId),
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
  async (params: { scopes: GraphScopeConfig; toolId: string; pagination?: PaginationConfig }) => {
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
            eq(subAgentToolRelations.graphId, subAgents.graphId)
          )
        )
        .where(
          and(
            eq(subAgentToolRelations.tenantId, params.scopes.tenantId),
            eq(subAgentToolRelations.projectId, params.scopes.projectId),
            eq(subAgentToolRelations.graphId, params.scopes.graphId),
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
            eq(subAgentToolRelations.graphId, params.scopes.graphId),
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

export const validateInternalSubAgent =
  (db: DatabaseClient) => async (params: { scopes: AgentScopeConfig }) => {
    const result = await db
      .select({ id: subAgents.id })
      .from(subAgents)
      .where(
        and(
          eq(subAgents.tenantId, params.scopes.tenantId),
          eq(subAgents.projectId, params.scopes.projectId),
          eq(subAgents.graphId, params.scopes.graphId),
          eq(subAgents.id, params.scopes.subAgentId)
        )
      )
      .limit(1);

    return result.length > 0;
  };

export const validateExternalAgent =
  (db: DatabaseClient) => async (params: { scopes: AgentScopeConfig }) => {
    const result = await db
      .select({ id: externalAgents.id })
      .from(externalAgents)
      .where(
        and(
          eq(externalAgents.tenantId, params.scopes.tenantId),
          eq(externalAgents.projectId, params.scopes.projectId),
          eq(externalAgents.graphId, params.scopes.graphId),
          eq(externalAgents.id, params.scopes.subAgentId)
        )
      )
      .limit(1);

    return result.length > 0;
  };
