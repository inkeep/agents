import { and, count, desc, eq, isNotNull, lte } from 'drizzle-orm';
import type { AgentsRunDatabaseClient } from '../../db/runtime/runtime-client';
import { scheduledTriggers } from '../../db/runtime/runtime-schema';
import type { AgentScopeConfig, PaginationConfig } from '../../types/utility';
import { computeNextRunAt } from '../../utils/compute-next-run-at';
import { getLogger } from '../../utils/logger';
import type { ScheduledTrigger, ScheduledTriggerInsert } from '../../types/entities';

const logger = getLogger('runtime-scheduledTriggers');

export const getScheduledTriggerById =
  (db: AgentsRunDatabaseClient) =>
  async (params: {
    scopes: AgentScopeConfig;
    scheduledTriggerId: string;
  }): Promise<ScheduledTrigger | undefined> => {
    const result = await db.query.scheduledTriggers.findFirst({
      where: and(
        eq(scheduledTriggers.tenantId, params.scopes.tenantId),
        eq(scheduledTriggers.projectId, params.scopes.projectId),
        eq(scheduledTriggers.agentId, params.scopes.agentId),
        eq(scheduledTriggers.id, params.scheduledTriggerId)
      ),
    });

    return result;
  };

export const listScheduledTriggersPaginated =
  (db: AgentsRunDatabaseClient) =>
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

export const createScheduledTrigger =
  (db: AgentsRunDatabaseClient) =>
  async (params: ScheduledTriggerInsert & { nextRunAt?: string | null }): Promise<ScheduledTrigger> => {
    const result = await db.insert(scheduledTriggers).values(params).returning();
    const created = result[0];
    if (!created) {
      throw new Error('Failed to create scheduled trigger');
    }
    return created;
  };

export const updateScheduledTrigger =
  (db: AgentsRunDatabaseClient) =>
  async (params: {
    scopes: AgentScopeConfig;
    scheduledTriggerId: string;
    data: Partial<ScheduledTriggerInsert> & { nextRunAt?: string | null };
  }): Promise<ScheduledTrigger> => {
    const updateData = {
      ...params.data,
      updatedAt: new Date().toISOString(),
    };

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

    const updated = result[0];
    if (!updated) {
      throw new Error(`Scheduled trigger ${params.scheduledTriggerId} not found for update`);
    }
    return updated;
  };

export const deleteScheduledTrigger =
  (db: AgentsRunDatabaseClient) =>
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

export const upsertScheduledTrigger =
  (db: AgentsRunDatabaseClient) =>
  async (params: {
    scopes: AgentScopeConfig;
    data: ScheduledTriggerInsert;
  }): Promise<ScheduledTrigger> => {
    const enabled = params.data.enabled ?? true;
    const nextRunAt = enabled
      ? computeNextRunAt({
          cronExpression: params.data.cronExpression,
          cronTimezone: params.data.cronTimezone,
          runAt: params.data.runAt,
        })
      : null;

    const now = new Date().toISOString();
    const values = { ...params.data, nextRunAt };

    const result = await db
      .insert(scheduledTriggers)
      .values(values)
      .onConflictDoUpdate({
        target: [scheduledTriggers.tenantId, scheduledTriggers.id],
        set: { ...values, updatedAt: now },
      })
      .returning();

    const upserted = result[0];
    if (!upserted) {
      throw new Error(`Failed to upsert scheduled trigger ${params.data.id}`);
    }
    return upserted;
  };

export const deleteScheduledTriggersByRunAsUserId =
  (db: AgentsRunDatabaseClient) =>
  async (params: { tenantId: string; projectId: string; runAsUserId: string }): Promise<void> => {
    await db
      .delete(scheduledTriggers)
      .where(
        and(
          eq(scheduledTriggers.tenantId, params.tenantId),
          eq(scheduledTriggers.projectId, params.projectId),
          eq(scheduledTriggers.runAsUserId, params.runAsUserId)
        )
      );
  };

export const listScheduledTriggers =
  (db: AgentsRunDatabaseClient) =>
  async (params: { scopes: AgentScopeConfig }): Promise<ScheduledTrigger[]> => {
    const result = await db
      .select()
      .from(scheduledTriggers)
      .where(
        and(
          eq(scheduledTriggers.tenantId, params.scopes.tenantId),
          eq(scheduledTriggers.projectId, params.scopes.projectId),
          eq(scheduledTriggers.agentId, params.scopes.agentId)
        )
      );

    return result;
  };

/**
 * Query due scheduled triggers across all projects directly from the runtime DB.
 * No AS OF queries needed - simple WHERE clause on enabled + nextRunAt.
 */
export const findDueScheduledTriggersAcrossProjects =
  (db: AgentsRunDatabaseClient) =>
  async (params: { asOf: string }): Promise<ScheduledTrigger[]> => {
    const rows = await db
      .select()
      .from(scheduledTriggers)
      .where(
        and(
          eq(scheduledTriggers.enabled, true),
          isNotNull(scheduledTriggers.nextRunAt),
          lte(scheduledTriggers.nextRunAt, params.asOf)
        )
      );

    return rows;
  };

/**
 * Advance the next_run_at timestamp for a scheduled trigger in the runtime DB.
 * No withRef scope needed - direct update.
 */
export const advanceScheduledTriggerNextRunAt =
  (db: AgentsRunDatabaseClient) =>
  async (params: {
    scopes: AgentScopeConfig;
    scheduledTriggerId: string;
    nextRunAt: string | null;
    enabled?: boolean;
  }): Promise<void> => {
    const set: Record<string, unknown> = {
      nextRunAt: params.nextRunAt,
      updatedAt: new Date().toISOString(),
    };

    if (params.enabled !== undefined) {
      set.enabled = params.enabled;
    }

    await db
      .update(scheduledTriggers)
      .set(set as any)
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
 * Delete all scheduled triggers targeting a specific branch ref.
 * Called when a branch is deleted.
 */
export const deleteScheduledTriggersByRef =
  (db: AgentsRunDatabaseClient) =>
  async (params: { tenantId: string; projectId: string; ref: string }): Promise<number> => {
    const result = await db
      .delete(scheduledTriggers)
      .where(
        and(
          eq(scheduledTriggers.tenantId, params.tenantId),
          eq(scheduledTriggers.projectId, params.projectId),
          eq(scheduledTriggers.ref, params.ref)
        )
      )
      .returning();

    if (result.length > 0) {
      logger.info(
        {
          tenantId: params.tenantId,
          projectId: params.projectId,
          ref: params.ref,
          count: result.length,
        },
        'Deleted scheduled triggers for deleted branch'
      );
    }

    return result.length;
  };
