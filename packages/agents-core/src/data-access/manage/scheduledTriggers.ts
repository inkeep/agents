import { and, count, desc, eq, isNotNull } from 'drizzle-orm';
import type { AgentsManageDatabaseClient } from '../../db/manage/manage-client';
import { scheduledTriggers } from '../../db/manage/manage-schema';
import type { AgentScopeConfig, PaginationConfig } from '../../types/utility';
import type {
  ScheduledTrigger,
  ScheduledTriggerInsert,
  ScheduledTriggerUpdate,
} from '../../validation/schemas';

/**
 * Get a scheduled trigger by ID (agent-scoped)
 */
export const getScheduledTriggerById =
  (db: AgentsManageDatabaseClient) =>
  async (params: {
    scopes: AgentScopeConfig;
    scheduledTriggerId: string;
  }): Promise<ScheduledTrigger | undefined> => {
    const { scopes, scheduledTriggerId } = params;

    const result = await db.query.scheduledTriggers.findFirst({
      where: and(
        eq(scheduledTriggers.tenantId, scopes.tenantId),
        eq(scheduledTriggers.projectId, scopes.projectId),
        eq(scheduledTriggers.agentId, scopes.agentId),
        eq(scheduledTriggers.id, scheduledTriggerId)
      ),
    });

    return result as ScheduledTrigger | undefined;
  };

/**
 * List all scheduled triggers for an agent
 */
export const listScheduledTriggers =
  (db: AgentsManageDatabaseClient) =>
  async (params: { scopes: AgentScopeConfig }): Promise<ScheduledTrigger[]> => {
    const result = await db.query.scheduledTriggers.findMany({
      where: and(
        eq(scheduledTriggers.tenantId, params.scopes.tenantId),
        eq(scheduledTriggers.projectId, params.scopes.projectId),
        eq(scheduledTriggers.agentId, params.scopes.agentId)
      ),
    });
    return result as ScheduledTrigger[];
  };

/**
 * List scheduled triggers for an agent with pagination
 */
export const listScheduledTriggersPaginated =
  (db: AgentsManageDatabaseClient) =>
  async (params: { scopes: AgentScopeConfig; pagination?: PaginationConfig }) => {
    const page = params.pagination?.page || 1;
    const limit = Math.min(params.pagination?.limit || 10, 100);
    const offset = (page - 1) * limit;

    const whereClause = and(
      eq(scheduledTriggers.tenantId, params.scopes.tenantId),
      eq(scheduledTriggers.projectId, params.scopes.projectId),
      eq(scheduledTriggers.agentId, params.scopes.agentId)
    );

    const [data, totalResult] = await Promise.all([
      db
        .select()
        .from(scheduledTriggers)
        .where(whereClause)
        .limit(limit)
        .offset(offset)
        .orderBy(desc(scheduledTriggers.createdAt)),
      db.select({ count: count() }).from(scheduledTriggers).where(whereClause),
    ]);

    const total = totalResult[0]?.count || 0;
    const pages = Math.ceil(total / limit);

    return {
      data,
      pagination: { page, limit, total, pages },
    };
  };

/**
 * List enabled cron scheduled triggers (for workflow bootstrap)
 * Returns triggers with enabled=true and a cronExpression
 */
export const listEnabledCronTriggers =
  (db: AgentsManageDatabaseClient) => async (): Promise<ScheduledTrigger[]> => {
    const result = await db.query.scheduledTriggers.findMany({
      where: and(eq(scheduledTriggers.enabled, true), isNotNull(scheduledTriggers.cronExpression)),
    });
    return result as ScheduledTrigger[];
  };

/**
 * List enabled one-time scheduled triggers (for workflow bootstrap)
 * Returns triggers with enabled=true and a runAt timestamp
 */
export const listEnabledOneTimeTriggers =
  (db: AgentsManageDatabaseClient) => async (): Promise<ScheduledTrigger[]> => {
    const result = await db.query.scheduledTriggers.findMany({
      where: and(eq(scheduledTriggers.enabled, true), isNotNull(scheduledTriggers.runAt)),
    });
    return result as ScheduledTrigger[];
  };

/**
 * Create a new scheduled trigger (agent-scoped)
 */
export const createScheduledTrigger =
  (db: AgentsManageDatabaseClient) =>
  async (params: ScheduledTriggerInsert): Promise<ScheduledTrigger> => {
    const result = await db
      .insert(scheduledTriggers)
      .values(params as any)
      .returning();
    return result[0] as ScheduledTrigger;
  };

/**
 * Update a scheduled trigger (agent-scoped)
 */
export const updateScheduledTrigger =
  (db: AgentsManageDatabaseClient) =>
  async (params: {
    scopes: AgentScopeConfig;
    scheduledTriggerId: string;
    data: ScheduledTriggerUpdate;
  }): Promise<ScheduledTrigger> => {
    const updateData = {
      ...params.data,
      updatedAt: new Date().toISOString(),
    } as ScheduledTriggerUpdate;

    const result = await db
      .update(scheduledTriggers)
      .set(updateData as any)
      .where(
        and(
          eq(scheduledTriggers.tenantId, params.scopes.tenantId),
          eq(scheduledTriggers.projectId, params.scopes.projectId),
          eq(scheduledTriggers.agentId, params.scopes.agentId),
          eq(scheduledTriggers.id, params.scheduledTriggerId)
        )
      )
      .returning();

    return result[0] as ScheduledTrigger;
  };

/**
 * Delete a scheduled trigger (agent-scoped)
 */
export const deleteScheduledTrigger =
  (db: AgentsManageDatabaseClient) =>
  async (params: { scopes: AgentScopeConfig; scheduledTriggerId: string }): Promise<void> => {
    await db
      .delete(scheduledTriggers)
      .where(
        and(
          eq(scheduledTriggers.tenantId, params.scopes.tenantId),
          eq(scheduledTriggers.projectId, params.scopes.projectId),
          eq(scheduledTriggers.agentId, params.scopes.agentId),
          eq(scheduledTriggers.id, params.scheduledTriggerId)
        )
      );
  };

/**
 * Upsert a scheduled trigger (create or update based on existence)
 */
export const upsertScheduledTrigger =
  (db: AgentsManageDatabaseClient) =>
  async (params: {
    scopes: AgentScopeConfig;
    data: ScheduledTriggerInsert;
  }): Promise<ScheduledTrigger> => {
    const { scopes, data } = params;

    // Check if trigger exists
    const existing = await db.query.scheduledTriggers.findFirst({
      where: and(
        eq(scheduledTriggers.tenantId, scopes.tenantId),
        eq(scheduledTriggers.projectId, scopes.projectId),
        eq(scheduledTriggers.agentId, scopes.agentId),
        eq(scheduledTriggers.id, data.id)
      ),
    });

    if (existing) {
      // Update existing trigger
      const updateData = {
        ...data,
        updatedAt: new Date().toISOString(),
      };
      const result = await db
        .update(scheduledTriggers)
        .set(updateData as any)
        .where(
          and(
            eq(scheduledTriggers.tenantId, scopes.tenantId),
            eq(scheduledTriggers.projectId, scopes.projectId),
            eq(scheduledTriggers.agentId, scopes.agentId),
            eq(scheduledTriggers.id, data.id)
          )
        )
        .returning();
      return result[0] as ScheduledTrigger;
    }

    // Create new trigger
    const result = await db
      .insert(scheduledTriggers)
      .values({
        ...data,
        tenantId: scopes.tenantId,
        projectId: scopes.projectId,
        agentId: scopes.agentId,
      } as any)
      .returning();
    return result[0] as ScheduledTrigger;
  };
