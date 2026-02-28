import { and, count, desc, eq } from 'drizzle-orm';
import type { AgentsManageDatabaseClient } from '../../db/manage/manage-client';
import { triggers } from '../../db/manage/manage-schema';
import type { TriggerInsert, TriggerSelect, TriggerUpdate } from '../../types/entities';
import type { AgentScopeConfig, PaginationConfig } from '../../types/utility';

/**
 * Get a trigger by ID (agent-scoped)
 */
export const getTriggerById =
  (db: AgentsManageDatabaseClient) =>
  async (params: {
    scopes: AgentScopeConfig;
    triggerId: string;
  }): Promise<TriggerSelect | undefined> => {
    const { scopes, triggerId } = params;

    const result = await db.query.triggers.findFirst({
      where: and(
        eq(triggers.tenantId, scopes.tenantId),
        eq(triggers.projectId, scopes.projectId),
        eq(triggers.agentId, scopes.agentId),
        eq(triggers.id, triggerId)
      ),
    });

    return result as TriggerSelect | undefined;
  };

/**
 * List all triggers for an agent
 */
export const listTriggers =
  (db: AgentsManageDatabaseClient) =>
  async (params: { scopes: AgentScopeConfig }): Promise<TriggerSelect[]> => {
    const result = await db.query.triggers.findMany({
      where: and(
        eq(triggers.tenantId, params.scopes.tenantId),
        eq(triggers.projectId, params.scopes.projectId),
        eq(triggers.agentId, params.scopes.agentId)
      ),
    });
    return result as TriggerSelect[];
  };

/**
 * List triggers for an agent with pagination
 */
export const listTriggersPaginated =
  (db: AgentsManageDatabaseClient) =>
  async (params: { scopes: AgentScopeConfig; pagination?: PaginationConfig }) => {
    const page = params.pagination?.page || 1;
    const limit = Math.min(params.pagination?.limit || 10, 100);
    const offset = (page - 1) * limit;

    const whereClause = and(
      eq(triggers.tenantId, params.scopes.tenantId),
      eq(triggers.projectId, params.scopes.projectId),
      eq(triggers.agentId, params.scopes.agentId)
    );

    const [data, totalResult] = await Promise.all([
      db
        .select()
        .from(triggers)
        .where(whereClause)
        .limit(limit)
        .offset(offset)
        .orderBy(desc(triggers.createdAt)),
      db.select({ count: count() }).from(triggers).where(whereClause),
    ]);

    const total = totalResult[0]?.count || 0;
    const pages = Math.ceil(total / limit);

    return {
      data,
      pagination: { page, limit, total, pages },
    };
  };

/**
 * Create a new trigger (agent-scoped)
 */
export const createTrigger =
  (db: AgentsManageDatabaseClient) =>
  async (params: TriggerInsert): Promise<TriggerSelect> => {
    const result = await db
      .insert(triggers)
      .values(params as any)
      .returning();
    return result[0] as TriggerSelect;
  };

/**
 * Update a trigger (agent-scoped)
 */
export const updateTrigger =
  (db: AgentsManageDatabaseClient) =>
  async (params: {
    scopes: AgentScopeConfig;
    triggerId: string;
    data: TriggerUpdate;
  }): Promise<TriggerSelect> => {
    const updateData = {
      ...params.data,
      updatedAt: new Date().toISOString(),
    } as TriggerUpdate;

    const result = await db
      .update(triggers)
      .set(updateData as any)
      .where(
        and(
          eq(triggers.tenantId, params.scopes.tenantId),
          eq(triggers.projectId, params.scopes.projectId),
          eq(triggers.agentId, params.scopes.agentId),
          eq(triggers.id, params.triggerId)
        )
      )
      .returning();

    return result[0] as TriggerSelect;
  };

/**
 * Delete a trigger (agent-scoped)
 */
export const deleteTrigger =
  (db: AgentsManageDatabaseClient) =>
  async (params: { scopes: AgentScopeConfig; triggerId: string }): Promise<void> => {
    await db
      .delete(triggers)
      .where(
        and(
          eq(triggers.tenantId, params.scopes.tenantId),
          eq(triggers.projectId, params.scopes.projectId),
          eq(triggers.agentId, params.scopes.agentId),
          eq(triggers.id, params.triggerId)
        )
      );
  };

/**
 * Delete all webhook triggers for a given runAsUserId within a tenant+project scope.
 * Operates across all agents in the project (not agent-scoped).
 */
export const deleteTriggersByRunAsUserId =
  (db: AgentsManageDatabaseClient) =>
  async (params: { tenantId: string; projectId: string; runAsUserId: string }): Promise<void> => {
    await db
      .delete(triggers)
      .where(
        and(
          eq(triggers.tenantId, params.tenantId),
          eq(triggers.projectId, params.projectId),
          eq(triggers.runAsUserId, params.runAsUserId)
        )
      );
  };

/**
 * Upsert a trigger (create or update based on existence)
 */
export const upsertTrigger =
  (db: AgentsManageDatabaseClient) =>
  async (params: { scopes: AgentScopeConfig; data: TriggerInsert }): Promise<TriggerSelect> => {
    const { scopes, data } = params;

    // Check if trigger exists
    const existing = await db.query.triggers.findFirst({
      where: and(
        eq(triggers.tenantId, scopes.tenantId),
        eq(triggers.projectId, scopes.projectId),
        eq(triggers.agentId, scopes.agentId),
        eq(triggers.id, data.id)
      ),
    });

    if (existing) {
      // Update existing trigger
      const updateData = {
        ...data,
        updatedAt: new Date().toISOString(),
      };
      const result = await db
        .update(triggers)
        .set(updateData as any)
        .where(
          and(
            eq(triggers.tenantId, scopes.tenantId),
            eq(triggers.projectId, scopes.projectId),
            eq(triggers.agentId, scopes.agentId),
            eq(triggers.id, data.id)
          )
        )
        .returning();
      return result[0] as TriggerSelect;
    }

    // Create new trigger
    const result = await db
      .insert(triggers)
      .values({
        ...data,
        tenantId: scopes.tenantId,
        projectId: scopes.projectId,
        agentId: scopes.agentId,
      } as any)
      .returning();
    return result[0] as TriggerSelect;
  };
