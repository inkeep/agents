import { and, eq, or, desc, isNotNull, count } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import type { DatabaseClient } from '../db/client';
import { agentRelations, agents, externalAgents, agentToolRelations, tools } from '../db/schema';
import type {
  AgentRelationInsert,
  AgentRelationUpdate,
  AgentToolRelationUpdate,
  ExternalAgentRelationInsert,
} from '../types/entities';
import type { PaginationConfig, ScopeConfig } from '../types/utility';

export const getAgentRelationById =
  (db: DatabaseClient) => async (params: { scopes: ScopeConfig; relationId: string }) => {
    return db.query.agentRelations.findFirst({
      where: and(
        eq(agentRelations.tenantId, params.scopes.tenantId),
        eq(agentRelations.projectId, params.scopes.projectId),
        eq(agentRelations.id, params.relationId)
      ),
    });
  };

export const listAgentRelations =
  (db: DatabaseClient) =>
  async (params: { scopes: ScopeConfig; pagination?: PaginationConfig }) => {
    const page = params.pagination?.page || 1;
    const limit = Math.min(params.pagination?.limit || 10, 100);
    const offset = (page - 1) * limit;

    const whereClause = and(
      eq(agentRelations.tenantId, params.scopes.tenantId),
      eq(agentRelations.projectId, params.scopes.projectId)
    );

    const [data, totalResult] = await Promise.all([
      db
        .select()
        .from(agentRelations)
        .where(whereClause)
        .limit(limit)
        .offset(offset)
        .orderBy(desc(agentRelations.createdAt)),
      db.select({ count: count() }).from(agentRelations).where(whereClause),
    ]);

    const total = totalResult[0]?.count || 0;
    const pages = Math.ceil(total / limit);

    return { data, pagination: { page, limit, total, pages } };
  };

export const getAgentRelations =
  (db: DatabaseClient) =>
  async (params: { scopes: ScopeConfig; graphId: string; agentId: string }) => {
    return await db.query.agentRelations.findMany({
      where: and(
        eq(agentRelations.tenantId, params.scopes.tenantId),
        eq(agentRelations.projectId, params.scopes.projectId),
        eq(agentRelations.graphId, params.graphId),
        eq(agentRelations.sourceAgentId, params.agentId)
      ),
    });
  };

export const getAgentRelationsByGraph =
  (db: DatabaseClient) => async (params: { scopes: ScopeConfig; graphId: string }) => {
    return await db.query.agentRelations.findMany({
      where: and(
        eq(agentRelations.tenantId, params.scopes.tenantId),
        eq(agentRelations.projectId, params.scopes.projectId),
        eq(agentRelations.graphId, params.graphId)
      ),
    });
  };

export const getAgentRelationsBySource =
  (db: DatabaseClient) =>
  async (params: { scopes: ScopeConfig; sourceAgentId: string; pagination?: PaginationConfig }) => {
    const page = params.pagination?.page || 1;
    const limit = Math.min(params.pagination?.limit || 10, 100);
    const offset = (page - 1) * limit;

    const whereClause = and(
      eq(agentRelations.tenantId, params.scopes.tenantId),
      eq(agentRelations.projectId, params.scopes.projectId),
      eq(agentRelations.sourceAgentId, params.sourceAgentId)
    );

    const [data, totalResult] = await Promise.all([
      db
        .select()
        .from(agentRelations)
        .where(whereClause)
        .limit(limit)
        .offset(offset)
        .orderBy(desc(agentRelations.createdAt)),
      db.select({ count: count() }).from(agentRelations).where(whereClause),
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
  async (params: { scopes: ScopeConfig; targetAgentId: string; pagination?: PaginationConfig }) => {
    const page = params.pagination?.page || 1;
    const limit = Math.min(params.pagination?.limit || 10, 100);
    const offset = (page - 1) * limit;

    const whereClause = and(
      eq(agentRelations.tenantId, params.scopes.tenantId),
      eq(agentRelations.projectId, params.scopes.projectId),
      eq(agentRelations.targetAgentId, params.targetAgentId)
    );

    const [data, totalResult] = await Promise.all([
      db
        .select()
        .from(agentRelations)
        .where(whereClause)
        .limit(limit)
        .offset(offset)
        .orderBy(desc(agentRelations.createdAt)),
      db.select({ count: count() }).from(agentRelations).where(whereClause),
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
    scopes: ScopeConfig;
    externalAgentId: string;
    pagination?: PaginationConfig;
  }) => {
    const page = params.pagination?.page || 1;
    const limit = Math.min(params.pagination?.limit || 10, 100);
    const offset = (page - 1) * limit;

    const whereClause = and(
      eq(agentRelations.tenantId, params.scopes.tenantId),
      eq(agentRelations.projectId, params.scopes.projectId),
      eq(agentRelations.externalAgentId, params.externalAgentId)
    );

    const [data, totalResult] = await Promise.all([
      db
        .select()
        .from(agentRelations)
        .where(whereClause)
        .limit(limit)
        .offset(offset)
        .orderBy(desc(agentRelations.createdAt)),
      db.select({ count: count() }).from(agentRelations).where(whereClause),
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
  (db: DatabaseClient) =>
  async (params: { scopes: ScopeConfig; graphId: string; agentId: string }) => {
    // Get internal agent relations
    const internalRelations = await db
      .select({
        id: agents.id,
        name: agents.name,
        description: agents.description,
        relationType: agentRelations.relationType,
      })
      .from(agentRelations)
      .innerJoin(agents, eq(agentRelations.targetAgentId, agents.id))
      .where(
        and(
          eq(agentRelations.tenantId, params.scopes.tenantId),
          eq(agentRelations.projectId, params.scopes.projectId),
          eq(agentRelations.graphId, params.graphId),
          eq(agentRelations.sourceAgentId, params.agentId),
          isNotNull(agentRelations.targetAgentId),
          eq(agents.tenantId, params.scopes.tenantId),
          eq(agents.projectId, params.scopes.projectId)
        )
      );

    // Get external agent relations
    const externalRelations = await db
      .select({
        id: agentRelations.id,
        relationType: agentRelations.relationType,
        externalAgent: {
          id: externalAgents.id,
          name: externalAgents.name,
          description: externalAgents.description,
          baseUrl: externalAgents.baseUrl,
        },
      })
      .from(agentRelations)
      .innerJoin(externalAgents, eq(agentRelations.externalAgentId, externalAgents.id))
      .where(
        and(
          eq(agentRelations.tenantId, params.scopes.tenantId),
          eq(agentRelations.projectId, params.scopes.projectId),
          eq(agentRelations.graphId, params.graphId),
          eq(agentRelations.sourceAgentId, params.agentId),
          isNotNull(agentRelations.externalAgentId),
          eq(externalAgents.tenantId, params.scopes.tenantId),
          eq(externalAgents.projectId, params.scopes.projectId)
        )
      );

    // Return both types of relations separately
    return {
      internalRelations,
      externalRelations,
    };
  };

export const createAgentRelation = (db: DatabaseClient) => async (params: AgentRelationInsert) => {
  // Validate that exactly one of targetAgentId or externalAgentId is provided
  const hasTargetAgent = params.targetAgentId != null;
  const hasExternalAgent = params.externalAgentId != null;

  if (hasTargetAgent && hasExternalAgent) {
    throw new Error('Cannot specify both targetAgentId and externalAgentId');
  }

  if (!hasTargetAgent && !hasExternalAgent) {
    throw new Error('Must specify either targetAgentId or externalAgentId');
  }

  const relation = await db
    .insert(agentRelations)
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
    scopes: ScopeConfig;
    graphId: string;
    sourceAgentId: string;
    targetAgentId?: string;
    externalAgentId?: string;
    relationType: string;
  }) => {
    const whereConditions = [
      eq(agentRelations.tenantId, params.scopes.tenantId),
      eq(agentRelations.projectId, params.scopes.projectId),
      eq(agentRelations.graphId, params.graphId),
      eq(agentRelations.sourceAgentId, params.sourceAgentId),
      eq(agentRelations.relationType, params.relationType),
    ];

    if (params.targetAgentId) {
      whereConditions.push(eq(agentRelations.targetAgentId, params.targetAgentId));
    }

    if (params.externalAgentId) {
      whereConditions.push(eq(agentRelations.externalAgentId, params.externalAgentId));
    }

    return db.query.agentRelations.findFirst({
      where: and(...whereConditions),
    });
  };

/**
 * Upsert agent relation (create if it doesn't exist, no-op if it does)
 */
export const upsertAgentRelation = (db: DatabaseClient) => async (params: AgentRelationInsert) => {
  // Check if relation already exists
  const existing = await getAgentRelationByParams(db)({
    scopes: { tenantId: params.tenantId, projectId: params.projectId },
    graphId: params.graphId,
    sourceAgentId: params.sourceAgentId,
    targetAgentId: params.targetAgentId,
    externalAgentId: params.externalAgentId,
    relationType: params.relationType ?? '',
  });

  if (!existing) {
    // Create the relation if it doesn't exist
    return await createAgentRelation(db)(params);
  }

  // Return existing relation if it already exists
  return existing;
};

// Create external agent relation (convenience function)
export const createExternalAgentRelation =
  (db: DatabaseClient) => async (params: ExternalAgentRelationInsert) => {
    return await createAgentRelation(db)({
      ...params,
      targetAgentId: undefined,
    });
  };

export const updateAgentRelation =
  (db: DatabaseClient) =>
  async (params: { scopes: ScopeConfig; relationId: string; data: AgentRelationUpdate }) => {
    const updateData = {
      ...params.data,
      updatedAt: new Date().toISOString(),
    };

    const relation = await db
      .update(agentRelations)
      .set(updateData)
      .where(
        and(
          eq(agentRelations.tenantId, params.scopes.tenantId),
          eq(agentRelations.projectId, params.scopes.projectId),
          eq(agentRelations.id, params.relationId)
        )
      )
      .returning();

    return relation[0];
  };

export const deleteAgentRelation =
  (db: DatabaseClient) => async (params: { scopes: ScopeConfig; relationId: string }) => {
    const result = await db
      .delete(agentRelations)
      .where(
        and(
          eq(agentRelations.tenantId, params.scopes.tenantId),
          eq(agentRelations.projectId, params.scopes.projectId),
          eq(agentRelations.id, params.relationId)
        )
      );

    return (result.rowsAffected || 0) > 0;
  };

export const deleteAgentRelationsByGraph =
  (db: DatabaseClient) => async (params: { scopes: ScopeConfig; graphId: string }) => {
    const result = await db
      .delete(agentRelations)
      .where(
        and(
          eq(agentRelations.tenantId, params.scopes.tenantId),
          eq(agentRelations.graphId, params.graphId)
        )
      );
    return (result.rowsAffected || 0) > 0;
  };

// Create agent tool relation
export const createAgentToolRelation =
  (db: DatabaseClient) =>
  async (params: {
    scopes: ScopeConfig;
    relationId?: string;
    data: { agentId: string; toolId: string };
  }) => {
    const finalRelationId = params.relationId ?? nanoid();

    const relation = await db
      .insert(agentToolRelations)
      .values({
        id: finalRelationId,
        tenantId: params.scopes.tenantId,
        projectId: params.scopes.projectId,
        agentId: params.data.agentId,
        toolId: params.data.toolId,
      })
      .returning();

    return relation[0];
  };

// Update agent tool relation
export const updateAgentToolRelation =
  (db: DatabaseClient) =>
  async (params: { scopes: ScopeConfig; relationId: string; data: AgentToolRelationUpdate }) => {
    const updateData = {
      ...params.data,
      updatedAt: new Date().toISOString(),
    };

    const relation = await db
      .update(agentToolRelations)
      .set(updateData)
      .where(
        and(
          eq(agentToolRelations.tenantId, params.scopes.tenantId),
          eq(agentToolRelations.projectId, params.scopes.projectId),
          eq(agentToolRelations.id, params.relationId)
        )
      )
      .returning();

    return relation[0];
  };

// Delete agent tool relation
export const deleteAgentToolRelation =
  (db: DatabaseClient) => async (params: { scopes: ScopeConfig; relationId: string }) => {
    const result = await db
      .delete(agentToolRelations)
      .where(
        and(
          eq(agentToolRelations.tenantId, params.scopes.tenantId),
          eq(agentToolRelations.projectId, params.scopes.projectId),
          eq(agentToolRelations.id, params.relationId)
        )
      );

    return (result.rowsAffected || 0) > 0;
  };

export const deleteAgentToolRelationByAgent =
  (db: DatabaseClient) => async (params: { scopes: ScopeConfig; agentId: string }) => {
    const result = await db
      .delete(agentToolRelations)
      .where(
        and(
          eq(agentToolRelations.tenantId, params.scopes.tenantId),
          eq(agentToolRelations.agentId, params.agentId)
        )
      );
    return (result.rowsAffected || 0) > 0;
  };

export const getAgentToolRelationById =
  (db: DatabaseClient) => async (params: { scopes: ScopeConfig; relationId: string }) => {
    return await db.query.agentToolRelations.findFirst({
      where: and(
        eq(agentToolRelations.tenantId, params.scopes.tenantId),
        eq(agentToolRelations.projectId, params.scopes.projectId),
        eq(agentToolRelations.id, params.relationId)
      ),
    });
  };

export const getAgentToolRelationByAgent =
  (db: DatabaseClient) =>
  async (params: { scopes: ScopeConfig; agentId: string; pagination?: PaginationConfig }) => {
    const page = params.pagination?.page || 1;
    const limit = Math.min(params.pagination?.limit || 10, 100);
    const offset = (page - 1) * limit;

    const [data, totalResult] = await Promise.all([
      db
        .select()
        .from(agentToolRelations)
        .where(
          and(
            eq(agentToolRelations.tenantId, params.scopes.tenantId),
            eq(agentToolRelations.projectId, params.scopes.projectId),
            eq(agentToolRelations.agentId, params.agentId)
          )
        )
        .limit(limit)
        .offset(offset)
        .orderBy(desc(agentToolRelations.createdAt)),
      db
        .select({ count: count() })
        .from(agentToolRelations)
        .where(
          and(
            eq(agentToolRelations.tenantId, params.scopes.tenantId),
            eq(agentToolRelations.projectId, params.scopes.projectId),
            eq(agentToolRelations.agentId, params.agentId)
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
  async (params: { scopes: ScopeConfig; toolId: string; pagination?: PaginationConfig }) => {
    const page = params.pagination?.page || 1;
    const limit = Math.min(params.pagination?.limit || 10, 100);
    const offset = (page - 1) * limit;

    const [data, totalResult] = await Promise.all([
      db
        .select()
        .from(agentToolRelations)
        .where(
          and(
            eq(agentToolRelations.tenantId, params.scopes.tenantId),
            eq(agentToolRelations.projectId, params.scopes.projectId),
            eq(agentToolRelations.toolId, params.toolId)
          )
        )
        .limit(limit)
        .offset(offset)
        .orderBy(desc(agentToolRelations.createdAt)),
      db
        .select({ count: count() })
        .from(agentToolRelations)
        .where(
          and(
            eq(agentToolRelations.tenantId, params.scopes.tenantId),
            eq(agentToolRelations.projectId, params.scopes.projectId),
            eq(agentToolRelations.toolId, params.toolId)
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
  async (params: { scopes: ScopeConfig; pagination?: PaginationConfig }) => {
    const page = params.pagination?.page || 1;
    const limit = Math.min(params.pagination?.limit || 10, 100);
    const offset = (page - 1) * limit;
    const [data, totalResult] = await Promise.all([
      db
        .select()
        .from(agentToolRelations)
        .where(
          and(
            eq(agentToolRelations.tenantId, params.scopes.tenantId),
            eq(agentToolRelations.projectId, params.scopes.projectId)
          )
        )
        .limit(limit)
        .offset(offset)
        .orderBy(desc(agentToolRelations.createdAt)),
      db
        .select({ count: count() })
        .from(agentToolRelations)
        .where(
          and(
            eq(agentToolRelations.tenantId, params.scopes.tenantId),
            eq(agentToolRelations.projectId, params.scopes.projectId)
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

// Get agent tool relations by agent with pagination
export const listAgentToolRelationsByAgent =
  (db: DatabaseClient) =>
  async (params: { scopes: ScopeConfig; agentId: string; pagination?: PaginationConfig }) => {
    const page = params.pagination?.page || 1;
    const limit = Math.min(params.pagination?.limit || 10, 100);
    const offset = (page - 1) * limit;

    const whereClause = and(
      eq(agentToolRelations.tenantId, params.scopes.tenantId),
      eq(agentToolRelations.projectId, params.scopes.projectId),
      eq(agentToolRelations.agentId, params.agentId)
    );

    const [data, totalResult] = await Promise.all([
      db
        .select()
        .from(agentToolRelations)
        .where(whereClause)
        .limit(limit)
        .offset(offset)
        .orderBy(desc(agentToolRelations.createdAt)),
      db.select({ count: count() }).from(agentToolRelations).where(whereClause),
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
  async (params: { scopes: ScopeConfig; agentId: string; pagination?: PaginationConfig }) => {
    const page = params.pagination?.page || 1;
    const limit = Math.min(params.pagination?.limit || 10, 100);
    const offset = (page - 1) * limit;

    const [data, totalResult] = await Promise.all([
      db
        .select({
          id: agentToolRelations.id,
          tenantId: agentToolRelations.tenantId,
          agentId: agentToolRelations.agentId,
          toolId: agentToolRelations.toolId,
          createdAt: agentToolRelations.createdAt,
          updatedAt: agentToolRelations.updatedAt,
          tool: {
            id: tools.id,
            name: tools.name,
            config: tools.config,
            createdAt: tools.createdAt,
            updatedAt: tools.updatedAt,
            capabilities: tools.capabilities,
            lastHealthCheck: tools.lastHealthCheck,
            lastToolsSync: tools.lastToolsSync,
            lastError: tools.lastError,
            availableTools: tools.availableTools,
            credentialReferenceId: tools.credentialReferenceId,
          },
        })
        .from(agentToolRelations)
        .innerJoin(tools, eq(agentToolRelations.toolId, tools.id))
        .where(
          and(
            eq(agentToolRelations.tenantId, params.scopes.tenantId),
            eq(agentToolRelations.projectId, params.scopes.projectId),
            eq(agentToolRelations.agentId, params.agentId)
          )
        )
        .limit(limit)
        .offset(offset)
        .orderBy(desc(agentToolRelations.createdAt)),
      db
        .select({ count: count() })
        .from(agentToolRelations)
        .where(
          and(
            eq(agentToolRelations.tenantId, params.scopes.tenantId),
            eq(agentToolRelations.projectId, params.scopes.projectId),
            eq(agentToolRelations.agentId, params.agentId)
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
  async (params: { scopes: ScopeConfig; toolId: string; pagination?: PaginationConfig }) => {
    const page = params.pagination?.page || 1;
    const limit = Math.min(params.pagination?.limit || 10, 100);
    const offset = (page - 1) * limit;

    const [data, totalResult] = await Promise.all([
      db
        .select({
          id: agentToolRelations.id,
          tenantId: agentToolRelations.tenantId,
          agentId: agentToolRelations.agentId,
          toolId: agentToolRelations.toolId,
          createdAt: agentToolRelations.createdAt,
          updatedAt: agentToolRelations.updatedAt,
          agent: {
            id: agents.id,
            name: agents.name,
            description: agents.description,
            prompt: agents.prompt,
            createdAt: agents.createdAt,
            updatedAt: agents.updatedAt,
          },
        })
        .from(agentToolRelations)
        .innerJoin(agents, eq(agentToolRelations.agentId, agents.id))
        .where(
          and(
            eq(agentToolRelations.tenantId, params.scopes.tenantId),
            eq(agentToolRelations.projectId, params.scopes.projectId),
            eq(agentToolRelations.toolId, params.toolId)
          )
        )
        .limit(limit)
        .offset(offset)
        .orderBy(desc(agentToolRelations.createdAt)),
      db
        .select({ count: count() })
        .from(agentToolRelations)
        .where(
          and(
            eq(agentToolRelations.tenantId, params.scopes.tenantId),
            eq(agentToolRelations.projectId, params.scopes.projectId),
            eq(agentToolRelations.toolId, params.toolId)
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

export const validateInternalAgent =
  (db: DatabaseClient) => async (params: { scopes: ScopeConfig; agentId: string }) => {
    const result = await db
      .select({ id: agents.id })
      .from(agents)
      .where(
        and(
          eq(agents.tenantId, params.scopes.tenantId),
          eq(agents.projectId, params.scopes.projectId),
          eq(agents.id, params.agentId)
        )
      )
      .limit(1);

    return result.length > 0;
  };

export const validateExternalAgent =
  (db: DatabaseClient) => async (params: { scopes: ScopeConfig; agentId: string }) => {
    const result = await db
      .select({ id: externalAgents.id })
      .from(externalAgents)
      .where(
        and(
          eq(externalAgents.tenantId, params.scopes.tenantId),
          eq(externalAgents.projectId, params.scopes.projectId),
          eq(externalAgents.id, params.agentId)
        )
      )
      .limit(1);

    return result.length > 0;
  };
