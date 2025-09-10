import { and, count, desc, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import type { DatabaseClient } from '../db/client';
import { agentToolRelations, tools } from '../db/schema';
import type {
  McpTool,
  McpToolStatus,
  PaginationConfig,
  ScopeConfig,
  ToolInsert,
  ToolSelect,
  ToolUpdate,
} from '../types/index';

// Helper function to convert database result to McpTool
export const dbResultToMcpTool = (dbResult: ToolSelect): McpTool => {
  const {
    headers,
    capabilities,
    credentialReferenceId,
    lastError,
    availableTools,
    imageUrl,
    lastHealthCheck,
    lastToolsSync,
    createdAt,
    updatedAt,
    ...rest
  } = dbResult;
  return {
    ...rest,
    status: dbResult.status as McpToolStatus,
    capabilities: capabilities || undefined,
    credentialReferenceId: credentialReferenceId || undefined,
    lastHealthCheck: lastHealthCheck ? new Date(lastHealthCheck) : undefined,
    lastToolsSync: lastToolsSync ? new Date(lastToolsSync) : undefined,
    createdAt: new Date(createdAt),
    updatedAt: new Date(updatedAt),
    lastError: lastError || undefined,
    availableTools: availableTools || undefined,
    headers: headers || undefined,
    imageUrl: imageUrl || undefined,
  };
};

export const getToolById =
  (db: DatabaseClient) => async (params: { scopes: ScopeConfig; toolId: string }) => {
    const result = await db.query.tools.findFirst({
      where: and(
        eq(tools.tenantId, params.scopes.tenantId),
        eq(tools.projectId, params.scopes.projectId),
        eq(tools.id, params.toolId)
      ),
    });
    return result ?? null;
  };

export const listTools =
  (db: DatabaseClient) =>
  async (params: { scopes: ScopeConfig; pagination?: PaginationConfig }) => {
    const page = params.pagination?.page || 1;
    const limit = Math.min(params.pagination?.limit || 10, 100);
    const offset = (page - 1) * limit;

    const whereClause = and(
      eq(tools.tenantId, params.scopes.tenantId),
      eq(tools.projectId, params.scopes.projectId)
    );

    const [query, totalResult] = await Promise.all([
      db
        .select()
        .from(tools)
        .where(whereClause)
        .limit(limit)
        .offset(offset)
        .orderBy(desc(tools.createdAt)),
      db.select({ count: count() }).from(tools).where(whereClause),
    ]);

    const total = totalResult[0]?.count || 0;
    const pages = Math.ceil(total / limit);

    return {
      data: query,
      pagination: { page, limit, total, pages },
    };
  };

export const getToolsByStatus =
  (db: DatabaseClient) => async (params: { scopes: ScopeConfig; status: string }) => {
    return db
      .select()
      .from(tools)
      .where(
        and(
          eq(tools.tenantId, params.scopes.tenantId),
          eq(tools.projectId, params.scopes.projectId),
          eq(tools.status, params.status)
        )
      );
  };

export const listToolsByStatus =
  (db: DatabaseClient) => async (params: { scopes: ScopeConfig; status: McpToolStatus }) => {
    const toolsList = await db.query.tools.findMany({
      where: and(
        eq(tools.tenantId, params.scopes.tenantId),
        eq(tools.status, params.status),
        eq(tools.projectId, params.scopes.projectId)
      ),
      orderBy: desc(tools.createdAt),
    });
    return toolsList;
  };

export const createTool = (db: DatabaseClient) => async (params: ToolInsert) => {
  const now = new Date().toISOString();

  const [created] = await db
    .insert(tools)
    .values({
      ...params,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return created;
};

export const updateTool =
  (db: DatabaseClient) =>
  async (params: { scopes: ScopeConfig; toolId: string; data: ToolUpdate }) => {
    const now = new Date().toISOString();

    const [updated] = await db
      .update(tools)
      .set({
        ...params.data,
        updatedAt: now,
      })
      .where(
        and(
          eq(tools.tenantId, params.scopes.tenantId),
          eq(tools.projectId, params.scopes.projectId),
          eq(tools.id, params.toolId)
        )
      )
      .returning();

    return updated ?? null;
  };

export const deleteTool =
  (db: DatabaseClient) => async (params: { scopes: ScopeConfig; toolId: string }) => {
    const [deleted] = await db
      .delete(tools)
      .where(
        and(
          eq(tools.tenantId, params.scopes.tenantId),
          eq(tools.projectId, params.scopes.projectId),
          eq(tools.id, params.toolId)
        )
      )
      .returning();

    return !!deleted;
  };

export const addToolToAgent =
  (db: DatabaseClient) =>
  async (params: { scopes: ScopeConfig; agentId: string; toolId: string }) => {
    const id = nanoid();
    const now = new Date().toISOString();

    const [created] = await db
      .insert(agentToolRelations)
      .values({
        id,
        tenantId: params.scopes.tenantId,
        projectId: params.scopes.projectId,
        agentId: params.agentId,
        toolId: params.toolId,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return created;
  };

export const removeToolFromAgent =
  (db: DatabaseClient) =>
  async (params: { scopes: ScopeConfig; agentId: string; toolId: string }) => {
    const [deleted] = await db
      .delete(agentToolRelations)
      .where(
        and(
          eq(agentToolRelations.tenantId, params.scopes.tenantId),
          eq(agentToolRelations.projectId, params.scopes.projectId),
          eq(agentToolRelations.agentId, params.agentId),
          eq(agentToolRelations.toolId, params.toolId)
        )
      )
      .returning();

    return deleted;
  };

/**
 * Upsert agent-tool relation (create if it doesn't exist, no-op if it does)
 */
export const upsertAgentToolRelation =
  (db: DatabaseClient) =>
  async (params: { scopes: ScopeConfig; agentId: string; toolId: string }) => {
    // Check if relation already exists
    const existing = await db.query.agentToolRelations.findFirst({
      where: and(
        eq(agentToolRelations.tenantId, params.scopes.tenantId),
        eq(agentToolRelations.projectId, params.scopes.projectId),
        eq(agentToolRelations.agentId, params.agentId),
        eq(agentToolRelations.toolId, params.toolId)
      ),
    });

    if (!existing) {
      // Create the relation if it doesn't exist
      return await addToolToAgent(db)(params);
    }

    // Return existing relation if it already exists
    return existing;
  };

export const updateToolStatus =
  (db: DatabaseClient) =>
  async (params: {
    scopes: ScopeConfig;
    toolId: string;
    status: string;
    lastHealthCheck?: string;
    lastError?: string;
  }) => {
    return updateTool(db)({
      scopes: params.scopes,
      toolId: params.toolId,
      data: {
        status: params.status,
        lastHealthCheck: params.lastHealthCheck || new Date().toISOString(),
        lastError: params.lastError,
      },
    });
  };

/**
 * Upsert a tool (create if it doesn't exist, update if it does)
 */
export const upsertTool = (db: DatabaseClient) => async (params: { data: ToolInsert }) => {
  const scopes = { tenantId: params.data.tenantId, projectId: params.data.projectId };

  const existing = await getToolById(db)({
    scopes,
    toolId: params.data.id,
  });

  if (existing) {
    // Update existing tool
    return await updateTool(db)({
      scopes,
      toolId: params.data.id,
      data: {
        name: params.data.name,
        config: params.data.config,
        credentialReferenceId: params.data.credentialReferenceId,
        imageUrl: params.data.imageUrl,
        headers: params.data.headers,
      },
    });
  } else {
    // Create new tool
    return await createTool(db)(params.data);
  }
};

// Get healthy tools for agent execution
export const getHealthyToolsForAgent =
  (db: DatabaseClient) => async (params: { scopes: ScopeConfig; agentId: string }) => {
    const healthyTools = await db
      .select({
        tool: tools,
      })
      .from(tools)
      .innerJoin(
        agentToolRelations,
        and(
          eq(tools.id, agentToolRelations.toolId),
          eq(agentToolRelations.agentId, params.agentId),
          eq(agentToolRelations.tenantId, params.scopes.tenantId)
        )
      )
      .where(and(eq(tools.tenantId, params.scopes.tenantId), eq(tools.status, 'healthy')));

    return healthyTools.map((row) => row.tool);
  };
