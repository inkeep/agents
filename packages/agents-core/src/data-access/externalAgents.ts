import { and, asc, count, desc, eq } from 'drizzle-orm';
import type { DatabaseClient } from '../db/client';
import { externalAgents } from '../db/schema';
import type {
  ExternalAgentInsert,
  ExternalAgentSelect,
  ExternalAgentUpdate,
  GraphScopeConfig,
  PaginationConfig,
  ProjectScopeConfig,
} from '../types/index';

/**
 * Create a new external agent
 */
export const createExternalAgent =
  (db: DatabaseClient) =>
  async (params: ExternalAgentInsert): Promise<ExternalAgentSelect> => {
    const agent = await db.insert(externalAgents).values(params).returning();

    return agent[0];
  };

/**
 * Get external agent by ID
 */
export const getExternalAgent =
  (db: DatabaseClient) =>
  async (params: {
    scopes: GraphScopeConfig;
    agentId: string;
  }): Promise<ExternalAgentSelect | null> => {
    const result = await db.query.externalAgents.findFirst({
      where: and(
        eq(externalAgents.tenantId, params.scopes.tenantId),
        eq(externalAgents.projectId, params.scopes.projectId),
        eq(externalAgents.graphId, params.scopes.graphId),
        eq(externalAgents.id, params.agentId)
      ),
    });

    return result || null;
  };

/**
 * Get external agent by base URL
 */
export const getExternalAgentByUrl =
  (db: DatabaseClient) =>
  async (params: {
    scopes: GraphScopeConfig;
    baseUrl: string;
  }): Promise<ExternalAgentSelect | null> => {
    const result = await db.query.externalAgents.findFirst({
      where: and(
        eq(externalAgents.tenantId, params.scopes.tenantId),
        eq(externalAgents.projectId, params.scopes.projectId),
        eq(externalAgents.graphId, params.scopes.graphId),
        eq(externalAgents.baseUrl, params.baseUrl)
      ),
    });

    return result || null;
  };

/**
 * List external agents for a tenant
 */
export const listExternalAgents =
  (db: DatabaseClient) =>
  async (params: { scopes: GraphScopeConfig }): Promise<ExternalAgentSelect[]> => {
    return await db.query.externalAgents.findMany({
      where: and(
        eq(externalAgents.tenantId, params.scopes.tenantId),
        eq(externalAgents.projectId, params.scopes.projectId),
        eq(externalAgents.graphId, params.scopes.graphId)
      ),
      orderBy: [asc(externalAgents.name)],
    });
  };

/**
 * List external agents with pagination
 */
export const listExternalAgentsPaginated =
  (db: DatabaseClient) =>
  async (params: {
    scopes: GraphScopeConfig;
    pagination?: PaginationConfig;
  }): Promise<{
    data: ExternalAgentSelect[];
    pagination: { page: number; limit: number; total: number; pages: number };
  }> => {
    const page = params.pagination?.page || 1;
    const limit = Math.min(params.pagination?.limit || 10, 100);
    const offset = (page - 1) * limit;

    const [data, totalResult] = await Promise.all([
      db
        .select()
        .from(externalAgents)
        .where(
          and(
            eq(externalAgents.tenantId, params.scopes.tenantId),
            eq(externalAgents.projectId, params.scopes.projectId),
            eq(externalAgents.graphId, params.scopes.graphId)
          )
        )
        .limit(limit)
        .offset(offset)
        .orderBy(desc(externalAgents.createdAt)),
      db
        .select({ count: count() })
        .from(externalAgents)
        .where(
          and(
            eq(externalAgents.tenantId, params.scopes.tenantId),
            eq(externalAgents.projectId, params.scopes.projectId),
            eq(externalAgents.graphId, params.scopes.graphId)
          )
        ),
    ]);

    const total =
      typeof totalResult[0]?.count === 'string'
        ? parseInt(totalResult[0].count, 10)
        : totalResult[0]?.count || 0;
    const pages = Math.ceil(total / limit);

    return {
      data,
      pagination: { page, limit, total, pages },
    };
  };

/**
 * Update an existing external agent
 */
export const updateExternalAgent =
  (db: DatabaseClient) =>
  async (params: {
    scopes: GraphScopeConfig;
    agentId: string;
    data: Partial<ExternalAgentUpdate>;
  }): Promise<ExternalAgentSelect | null> => {
    const updateData: Partial<ExternalAgentUpdate> = {
      ...params.data,
      updatedAt: new Date().toISOString(),
    };

    if (Object.keys(updateData).length === 1) {
      // Only updatedAt
      throw new Error('No fields to update');
    }

    // Handle optional field clearing
    if (
      updateData.headers !== undefined &&
      (updateData.headers === null || Object.keys(updateData.headers || {}).length === 0)
    ) {
      updateData.headers = null;
    }
    if (updateData.credentialReferenceId === undefined) {
      updateData.credentialReferenceId = null;
    }

    const result = await db
      .update(externalAgents)
      .set(updateData)
      .where(
        and(
          eq(externalAgents.tenantId, params.scopes.tenantId),
          eq(externalAgents.projectId, params.scopes.projectId),
          eq(externalAgents.graphId, params.scopes.graphId),
          eq(externalAgents.id, params.agentId)
        )
      )
      .returning();

    return result[0] || null;
  };

/**
 * Upsert external agent (create if it doesn't exist, update if it does)
 */
export const upsertExternalAgent =
  (db: DatabaseClient) =>
  async (params: { data: ExternalAgentInsert }): Promise<ExternalAgentSelect> => {
    const scopes = {
      tenantId: params.data.tenantId,
      projectId: params.data.projectId,
      graphId: params.data.graphId,
    };

    const existing = await getExternalAgent(db)({
      scopes,
      agentId: params.data.id,
    });

    if (existing) {
      // Update existing external agent
      const updated = await updateExternalAgent(db)({
        scopes,
        agentId: params.data.id,
        data: {
          name: params.data.name,
          description: params.data.description,
          baseUrl: params.data.baseUrl,
          credentialReferenceId: params.data.credentialReferenceId,
          headers: params.data.headers,
        },
      });
      if (!updated) {
        throw new Error('Failed to update external agent - no rows affected');
      }
      return updated;
    } else {
      // Create new external agent
      return await createExternalAgent(db)(params.data);
    }
  };

/**
 * Delete an external agent
 */
export const deleteExternalAgent =
  (db: DatabaseClient) =>
  async (params: { scopes: GraphScopeConfig; agentId: string }): Promise<boolean> => {
    try {
      const result = await db
        .delete(externalAgents)
        .where(
          and(
            eq(externalAgents.tenantId, params.scopes.tenantId),
            eq(externalAgents.projectId, params.scopes.projectId),
            eq(externalAgents.graphId, params.scopes.graphId),
            eq(externalAgents.id, params.agentId)
          )
        )
        .returning();

      return result.length > 0;
    } catch (error) {
      console.error('Error deleting external agent:', error);
      return false;
    }
  };

/**
 * Check if an external agent exists
 */
export const externalAgentExists =
  (db: DatabaseClient) =>
  async (params: { scopes: GraphScopeConfig; agentId: string }): Promise<boolean> => {
    const agent = await getExternalAgent(db)(params);
    return agent !== null;
  };

/**
 * Check if an external agent exists by URL
 */
export const externalAgentUrlExists =
  (db: DatabaseClient) =>
  async (params: { scopes: GraphScopeConfig; baseUrl: string }): Promise<boolean> => {
    const agent = await getExternalAgentByUrl(db)(params);
    return agent !== null;
  };

/**
 * Count external agents for a tenant
 */
export const countExternalAgents =
  (db: DatabaseClient) =>
  async (params: { scopes: GraphScopeConfig }): Promise<number> => {
    const result = await db
      .select({ count: count() })
      .from(externalAgents)
      .where(
        and(
          eq(externalAgents.tenantId, params.scopes.tenantId),
          eq(externalAgents.projectId, params.scopes.projectId),
          eq(externalAgents.graphId, params.scopes.graphId)
        )
      );

    const countValue = result[0]?.count;
    return typeof countValue === 'string' ? parseInt(countValue, 10) : countValue || 0;
  };
