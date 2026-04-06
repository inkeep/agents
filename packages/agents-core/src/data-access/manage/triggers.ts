import { and, asc, count, desc, eq, inArray } from 'drizzle-orm';
import type { AgentsManageDatabaseClient } from '../../db/manage/manage-client';
import { triggers, triggerUsers } from '../../db/manage/manage-schema';
import type { TriggerInsert, TriggerSelect, TriggerUpdate } from '../../types/entities';
import type { AgentScopeConfig, PaginationConfig } from '../../types/utility';
import { agentScopedWhere, projectScopedWhere } from './scope-helpers';

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
      where: and(agentScopedWhere(triggers, scopes), eq(triggers.id, triggerId)),
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
      where: agentScopedWhere(triggers, params.scopes),
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

    const whereClause = agentScopedWhere(triggers, params.scopes);

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

export const createTriggerWithUsers =
  (db: AgentsManageDatabaseClient) =>
  async (params: { trigger: TriggerInsert; userIds: string[] }): Promise<TriggerSelect> => {
    return db.transaction(async (tx) => {
      const trigger = await createTrigger(tx)(params.trigger);

      if (params.userIds.length > 0) {
        await tx.insert(triggerUsers).values(
          params.userIds.map((userId) => ({
            tenantId: trigger.tenantId,
            projectId: trigger.projectId,
            agentId: trigger.agentId,
            triggerId: trigger.id,
            userId,
          }))
        );
      }

      return trigger;
    });
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
      .where(and(agentScopedWhere(triggers, params.scopes), eq(triggers.id, params.triggerId)))
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
      .where(and(agentScopedWhere(triggers, params.scopes), eq(triggers.id, params.triggerId)));
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
          projectScopedWhere(triggers, { tenantId: params.tenantId, projectId: params.projectId }),
          eq(triggers.runAsUserId, params.runAsUserId)
        )
      );
  };

export const getTriggerUsers =
  (db: AgentsManageDatabaseClient) =>
  async (params: { scopes: AgentScopeConfig; triggerId: string }) => {
    return db
      .select()
      .from(triggerUsers)
      .where(
        and(
          agentScopedWhere(triggerUsers, params.scopes),
          eq(triggerUsers.triggerId, params.triggerId)
        )
      )
      .orderBy(asc(triggerUsers.createdAt));
  };

export const getTriggerUsersBatch =
  (db: AgentsManageDatabaseClient) =>
  async (params: {
    scopes: AgentScopeConfig;
    triggerIds: string[];
  }): Promise<Map<string, string[]>> => {
    if (params.triggerIds.length === 0) return new Map();

    const rows = await db
      .select()
      .from(triggerUsers)
      .where(
        and(
          agentScopedWhere(triggerUsers, params.scopes),
          inArray(triggerUsers.triggerId, params.triggerIds)
        )
      )
      .orderBy(asc(triggerUsers.createdAt));

    const result = new Map<string, string[]>();
    for (const triggerId of params.triggerIds) {
      result.set(triggerId, []);
    }

    for (const row of rows) {
      const userIds = result.get(row.triggerId);
      if (userIds) {
        userIds.push(row.userId);
      }
    }

    return result;
  };

export const createTriggerUser =
  (db: AgentsManageDatabaseClient) =>
  async (params: { scopes: AgentScopeConfig; triggerId: string; userId: string }) => {
    const result = await db
      .insert(triggerUsers)
      .values({
        tenantId: params.scopes.tenantId,
        projectId: params.scopes.projectId,
        agentId: params.scopes.agentId,
        triggerId: params.triggerId,
        userId: params.userId,
      })
      .onConflictDoNothing()
      .returning();

    return result[0];
  };

export const deleteTriggerUser =
  (db: AgentsManageDatabaseClient) =>
  async (params: { scopes: AgentScopeConfig; triggerId: string; userId: string }) => {
    await db
      .delete(triggerUsers)
      .where(
        and(
          agentScopedWhere(triggerUsers, params.scopes),
          eq(triggerUsers.triggerId, params.triggerId),
          eq(triggerUsers.userId, params.userId)
        )
      );
  };

export const setTriggerUsers =
  (db: AgentsManageDatabaseClient) =>
  async (params: { scopes: AgentScopeConfig; triggerId: string; userIds: string[] }) => {
    await db.transaction(async (tx) => {
      await tx
        .delete(triggerUsers)
        .where(
          and(
            agentScopedWhere(triggerUsers, params.scopes),
            eq(triggerUsers.triggerId, params.triggerId)
          )
        );

      if (params.userIds.length > 0) {
        await tx.insert(triggerUsers).values(
          params.userIds.map((userId) => ({
            tenantId: params.scopes.tenantId,
            projectId: params.scopes.projectId,
            agentId: params.scopes.agentId,
            triggerId: params.triggerId,
            userId,
          }))
        );
      }
    });
  };

export const getTriggerUserCount =
  (db: AgentsManageDatabaseClient) =>
  async (params: { scopes: AgentScopeConfig; triggerId: string }): Promise<number> => {
    const result = await db
      .select({ count: count() })
      .from(triggerUsers)
      .where(
        and(
          agentScopedWhere(triggerUsers, params.scopes),
          eq(triggerUsers.triggerId, params.triggerId)
        )
      );

    return result[0]?.count ?? 0;
  };

export const getWebhookTriggerIdsWithUser =
  (db: AgentsManageDatabaseClient) =>
  async (params: { tenantId: string; projectId: string; userId: string }) => {
    return db
      .select({
        agentId: triggers.agentId,
        id: triggers.id,
      })
      .from(triggers)
      .innerJoin(
        triggerUsers,
        and(
          eq(triggerUsers.tenantId, triggers.tenantId),
          eq(triggerUsers.projectId, triggers.projectId),
          eq(triggerUsers.agentId, triggers.agentId),
          eq(triggerUsers.triggerId, triggers.id)
        )
      )
      .where(
        and(
          projectScopedWhere(triggers, { tenantId: params.tenantId, projectId: params.projectId }),
          eq(triggerUsers.userId, params.userId)
        )
      );
  };

export const removeUserFromProjectTriggerUsers =
  (db: AgentsManageDatabaseClient) =>
  async (params: { tenantId: string; projectId: string; userId: string }) => {
    await db.transaction(async (tx) => {
      const triggerRows = await getWebhookTriggerIdsWithUser(tx)(params);

      if (triggerRows.length === 0) return;

      const triggerIds = triggerRows.map((row) => row.id);

      await tx.delete(triggerUsers).where(
        and(
          projectScopedWhere(triggerUsers, {
            tenantId: params.tenantId,
            projectId: params.projectId,
          }),
          inArray(triggerUsers.triggerId, triggerIds),
          eq(triggerUsers.userId, params.userId)
        )
      );

      const triggersWithRemainingUsers = await tx
        .select({ triggerId: triggerUsers.triggerId })
        .from(triggerUsers)
        .where(
          and(
            projectScopedWhere(triggerUsers, {
              tenantId: params.tenantId,
              projectId: params.projectId,
            }),
            inArray(triggerUsers.triggerId, triggerIds)
          )
        )
        .groupBy(triggerUsers.triggerId);

      const triggerIdsWithRemainingUsers = new Set(
        triggersWithRemainingUsers.map((row) => row.triggerId)
      );
      const emptyTriggerIds = triggerIds.filter((id) => !triggerIdsWithRemainingUsers.has(id));

      if (emptyTriggerIds.length > 0) {
        await tx
          .update(triggers)
          .set({ enabled: false, updatedAt: new Date().toISOString() })
          .where(
            and(
              projectScopedWhere(triggers, {
                tenantId: params.tenantId,
                projectId: params.projectId,
              }),
              inArray(triggers.id, emptyTriggerIds),
              eq(triggers.enabled, true)
            )
          );
      }
    });
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
      where: and(agentScopedWhere(triggers, scopes), eq(triggers.id, data.id)),
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
        .where(and(agentScopedWhere(triggers, scopes), eq(triggers.id, data.id)))
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
