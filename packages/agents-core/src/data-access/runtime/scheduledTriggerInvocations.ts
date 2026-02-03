import { and, asc, count, desc, eq, gte, inArray, lte, ne, sql } from 'drizzle-orm';
import type { AgentsRunDatabaseClient } from '../../db/runtime/runtime-client';
import { scheduledTriggerInvocations } from '../../db/runtime/runtime-schema';
import type { AgentScopeConfig, PaginationConfig } from '../../types/utility';
import type {
  ScheduledTriggerInvocation,
  ScheduledTriggerInvocationInsert,
  ScheduledTriggerInvocationStatus,
  ScheduledTriggerInvocationUpdate,
} from '../../validation/schemas';

/**
 * Get a scheduled trigger invocation by ID (agent-scoped)
 */
export const getScheduledTriggerInvocationById =
  (db: AgentsRunDatabaseClient) =>
  async (params: {
    scopes: AgentScopeConfig;
    scheduledTriggerId: string;
    invocationId: string;
  }): Promise<ScheduledTriggerInvocation | undefined> => {
    const result = await db.query.scheduledTriggerInvocations.findFirst({
      where: and(
        eq(scheduledTriggerInvocations.tenantId, params.scopes.tenantId),
        eq(scheduledTriggerInvocations.projectId, params.scopes.projectId),
        eq(scheduledTriggerInvocations.agentId, params.scopes.agentId),
        eq(scheduledTriggerInvocations.scheduledTriggerId, params.scheduledTriggerId),
        eq(scheduledTriggerInvocations.id, params.invocationId)
      ),
    });
    return result as ScheduledTriggerInvocation | undefined;
  };

/**
 * Get a scheduled trigger invocation by idempotency key
 * Used to check if an invocation already exists for a given schedule
 */
export const getScheduledTriggerInvocationByIdempotencyKey =
  (db: AgentsRunDatabaseClient) =>
  async (params: { idempotencyKey: string }): Promise<ScheduledTriggerInvocation | undefined> => {
    const result = await db.query.scheduledTriggerInvocations.findFirst({
      where: eq(scheduledTriggerInvocations.idempotencyKey, params.idempotencyKey),
    });
    return result as ScheduledTriggerInvocation | undefined;
  };

/**
 * List scheduled trigger invocations with optional filtering (agent-scoped)
 */
export const listScheduledTriggerInvocationsPaginated =
  (db: AgentsRunDatabaseClient) =>
  async (params: {
    scopes: AgentScopeConfig;
    scheduledTriggerId: string;
    pagination?: PaginationConfig;
    filters?: {
      status?: ScheduledTriggerInvocationStatus;
      from?: string; // ISO 8601 date string
      to?: string; // ISO 8601 date string
    };
  }) => {
    const page = params.pagination?.page || 1;
    const limit = Math.min(params.pagination?.limit || 10, 100);
    const offset = (page - 1) * limit;

    const conditions = [
      eq(scheduledTriggerInvocations.tenantId, params.scopes.tenantId),
      eq(scheduledTriggerInvocations.projectId, params.scopes.projectId),
      eq(scheduledTriggerInvocations.agentId, params.scopes.agentId),
      eq(scheduledTriggerInvocations.scheduledTriggerId, params.scheduledTriggerId),
    ];

    // Add optional filters
    if (params.filters?.status) {
      conditions.push(eq(scheduledTriggerInvocations.status, params.filters.status));
    }
    if (params.filters?.from) {
      conditions.push(gte(scheduledTriggerInvocations.scheduledFor, params.filters.from));
    }
    if (params.filters?.to) {
      conditions.push(lte(scheduledTriggerInvocations.scheduledFor, params.filters.to));
    }

    const whereClause = and(...conditions);

    const [data, totalResult] = await Promise.all([
      db
        .select()
        .from(scheduledTriggerInvocations)
        .where(whereClause)
        .limit(limit)
        .offset(offset)
        .orderBy(desc(scheduledTriggerInvocations.scheduledFor)),
      db.select({ count: count() }).from(scheduledTriggerInvocations).where(whereClause),
    ]);

    const total = totalResult[0]?.count || 0;
    const pages = Math.ceil(total / limit);

    return {
      data,
      pagination: { page, limit, total, pages },
    };
  };

/**
 * List latest invocations for a trigger (for history/monitoring)
 */
export const listLatestScheduledTriggerInvocations =
  (db: AgentsRunDatabaseClient) =>
  async (params: {
    scopes: AgentScopeConfig;
    scheduledTriggerId: string;
    limit?: number;
  }): Promise<ScheduledTriggerInvocation[]> => {
    const maxLimit = Math.min(params.limit || 10, 100);

    const result = await db
      .select()
      .from(scheduledTriggerInvocations)
      .where(
        and(
          eq(scheduledTriggerInvocations.tenantId, params.scopes.tenantId),
          eq(scheduledTriggerInvocations.projectId, params.scopes.projectId),
          eq(scheduledTriggerInvocations.agentId, params.scopes.agentId),
          eq(scheduledTriggerInvocations.scheduledTriggerId, params.scheduledTriggerId)
        )
      )
      .orderBy(desc(scheduledTriggerInvocations.scheduledFor))
      .limit(maxLimit);

    return result as ScheduledTriggerInvocation[];
  };

/**
 * List pending invocations for a trigger, ordered by scheduledFor (earliest first)
 * Used by workflow to get the next invocation to execute
 */
export const listPendingScheduledTriggerInvocations =
  (db: AgentsRunDatabaseClient) =>
  async (params: {
    scopes: AgentScopeConfig;
    scheduledTriggerId: string;
    limit?: number;
  }): Promise<ScheduledTriggerInvocation[]> => {
    const maxLimit = Math.min(params.limit || 10, 100);

    const result = await db
      .select()
      .from(scheduledTriggerInvocations)
      .where(
        and(
          eq(scheduledTriggerInvocations.tenantId, params.scopes.tenantId),
          eq(scheduledTriggerInvocations.projectId, params.scopes.projectId),
          eq(scheduledTriggerInvocations.agentId, params.scopes.agentId),
          eq(scheduledTriggerInvocations.scheduledTriggerId, params.scheduledTriggerId),
          eq(scheduledTriggerInvocations.status, 'pending')
        )
      )
      .orderBy(asc(scheduledTriggerInvocations.scheduledFor))
      .limit(maxLimit);

    return result as ScheduledTriggerInvocation[];
  };

/**
 * Count pending invocations for a trigger
 * Used to determine how many more to pre-create
 */
export const countPendingScheduledTriggerInvocations =
  (db: AgentsRunDatabaseClient) =>
  async (params: {
    scopes: AgentScopeConfig;
    scheduledTriggerId: string;
  }): Promise<number> => {
    const result = await db
      .select({ count: count() })
      .from(scheduledTriggerInvocations)
      .where(
        and(
          eq(scheduledTriggerInvocations.tenantId, params.scopes.tenantId),
          eq(scheduledTriggerInvocations.projectId, params.scopes.projectId),
          eq(scheduledTriggerInvocations.agentId, params.scopes.agentId),
          eq(scheduledTriggerInvocations.scheduledTriggerId, params.scheduledTriggerId),
          eq(scheduledTriggerInvocations.status, 'pending')
        )
      );

    return result[0]?.count || 0;
  };

/**
 * Delete all pending invocations for a trigger
 * Used when cron expression changes or trigger is disabled
 */
export const deletePendingInvocationsForTrigger =
  (db: AgentsRunDatabaseClient) =>
  async (params: { scopes: AgentScopeConfig; scheduledTriggerId: string }): Promise<number> => {
    const result = await db
      .delete(scheduledTriggerInvocations)
      .where(
        and(
          eq(scheduledTriggerInvocations.tenantId, params.scopes.tenantId),
          eq(scheduledTriggerInvocations.projectId, params.scopes.projectId),
          eq(scheduledTriggerInvocations.agentId, params.scopes.agentId),
          eq(scheduledTriggerInvocations.scheduledTriggerId, params.scheduledTriggerId),
          eq(scheduledTriggerInvocations.status, 'pending')
        )
      )
      .returning();

    return result.length;
  };

/**
 * Create a new scheduled trigger invocation (agent-scoped)
 */
export const createScheduledTriggerInvocation =
  (db: AgentsRunDatabaseClient) =>
  async (params: ScheduledTriggerInvocationInsert): Promise<ScheduledTriggerInvocation> => {
    const result = await db
      .insert(scheduledTriggerInvocations)
      .values(params as any)
      .returning();
    return result[0] as ScheduledTriggerInvocation;
  };

/**
 * Update scheduled trigger invocation status (agent-scoped)
 */
export const updateScheduledTriggerInvocationStatus =
  (db: AgentsRunDatabaseClient) =>
  async (params: {
    scopes: AgentScopeConfig;
    scheduledTriggerId: string;
    invocationId: string;
    data: ScheduledTriggerInvocationUpdate;
  }): Promise<ScheduledTriggerInvocation> => {
    const result = await db
      .update(scheduledTriggerInvocations)
      .set(params.data as any)
      .where(
        and(
          eq(scheduledTriggerInvocations.tenantId, params.scopes.tenantId),
          eq(scheduledTriggerInvocations.projectId, params.scopes.projectId),
          eq(scheduledTriggerInvocations.agentId, params.scopes.agentId),
          eq(scheduledTriggerInvocations.scheduledTriggerId, params.scheduledTriggerId),
          eq(scheduledTriggerInvocations.id, params.invocationId)
        )
      )
      .returning();

    return result[0] as ScheduledTriggerInvocation;
  };

/**
 * Mark invocation as running
 */
export const markScheduledTriggerInvocationRunning =
  (db: AgentsRunDatabaseClient) =>
  async (params: {
    scopes: AgentScopeConfig;
    scheduledTriggerId: string;
    invocationId: string;
    traceId?: string;
  }): Promise<ScheduledTriggerInvocation> => {
    const now = new Date().toISOString();
    const result = await db
      .update(scheduledTriggerInvocations)
      .set({
        status: 'running',
        startedAt: sql`COALESCE(${scheduledTriggerInvocations.startedAt}, ${now})`,
        traceId: params.traceId,
      })
      .where(
        and(
          eq(scheduledTriggerInvocations.tenantId, params.scopes.tenantId),
          eq(scheduledTriggerInvocations.projectId, params.scopes.projectId),
          eq(scheduledTriggerInvocations.agentId, params.scopes.agentId),
          eq(scheduledTriggerInvocations.scheduledTriggerId, params.scheduledTriggerId),
          eq(scheduledTriggerInvocations.id, params.invocationId)
        )
      )
      .returning();

    return result[0] as ScheduledTriggerInvocation;
  };

/**
 * Mark invocation as completed
 * Note: Will not update if status is already 'cancelled' to respect user cancellation
 */
export const markScheduledTriggerInvocationCompleted =
  (db: AgentsRunDatabaseClient) =>
  async (params: {
    scopes: AgentScopeConfig;
    scheduledTriggerId: string;
    invocationId: string;
    conversationId?: string;
  }): Promise<ScheduledTriggerInvocation | undefined> => {
    const result = await db
      .update(scheduledTriggerInvocations)
      .set({
        status: 'completed',
        completedAt: new Date().toISOString(),
        conversationId: params.conversationId,
      })
      .where(
        and(
          eq(scheduledTriggerInvocations.tenantId, params.scopes.tenantId),
          eq(scheduledTriggerInvocations.projectId, params.scopes.projectId),
          eq(scheduledTriggerInvocations.agentId, params.scopes.agentId),
          eq(scheduledTriggerInvocations.scheduledTriggerId, params.scheduledTriggerId),
          eq(scheduledTriggerInvocations.id, params.invocationId),
          // Don't overwrite if already cancelled
          ne(scheduledTriggerInvocations.status, 'cancelled')
        )
      )
      .returning();

    return result[0] as ScheduledTriggerInvocation | undefined;
  };

/**
 * Mark invocation as failed
 * Note: Will not update if status is already 'cancelled' to respect user cancellation
 */
export const markScheduledTriggerInvocationFailed =
  (db: AgentsRunDatabaseClient) =>
  async (params: {
    scopes: AgentScopeConfig;
    scheduledTriggerId: string;
    invocationId: string;
    errorMessage: string;
    errorCode?: string;
  }): Promise<ScheduledTriggerInvocation | undefined> => {
    const result = await db
      .update(scheduledTriggerInvocations)
      .set({
        status: 'failed',
        completedAt: new Date().toISOString(),
        errorMessage: params.errorMessage,
        errorCode: params.errorCode,
      })
      .where(
        and(
          eq(scheduledTriggerInvocations.tenantId, params.scopes.tenantId),
          eq(scheduledTriggerInvocations.projectId, params.scopes.projectId),
          eq(scheduledTriggerInvocations.agentId, params.scopes.agentId),
          eq(scheduledTriggerInvocations.scheduledTriggerId, params.scheduledTriggerId),
          eq(scheduledTriggerInvocations.id, params.invocationId),
          // Don't overwrite if already cancelled
          ne(scheduledTriggerInvocations.status, 'cancelled')
        )
      )
      .returning();

    return result[0] as ScheduledTriggerInvocation | undefined;
  };

/**
 * Mark invocation as cancelled
 */
export const markScheduledTriggerInvocationCancelled =
  (db: AgentsRunDatabaseClient) =>
  async (params: {
    scopes: AgentScopeConfig;
    scheduledTriggerId: string;
    invocationId: string;
  }): Promise<ScheduledTriggerInvocation> => {
    const result = await db
      .update(scheduledTriggerInvocations)
      .set({
        status: 'cancelled',
        completedAt: new Date().toISOString(),
      })
      .where(
        and(
          eq(scheduledTriggerInvocations.tenantId, params.scopes.tenantId),
          eq(scheduledTriggerInvocations.projectId, params.scopes.projectId),
          eq(scheduledTriggerInvocations.agentId, params.scopes.agentId),
          eq(scheduledTriggerInvocations.scheduledTriggerId, params.scheduledTriggerId),
          eq(scheduledTriggerInvocations.id, params.invocationId)
        )
      )
      .returning();

    return result[0] as ScheduledTriggerInvocation;
  };

/**
 * Cancel all pending invocations for a trigger
 * Used when a trigger is deleted
 */
export const cancelPendingInvocationsForTrigger =
  (db: AgentsRunDatabaseClient) =>
  async (params: { scopes: AgentScopeConfig; scheduledTriggerId: string }): Promise<number> => {
    const result = await db
      .update(scheduledTriggerInvocations)
      .set({
        status: 'cancelled',
        completedAt: new Date().toISOString(),
      })
      .where(
        and(
          eq(scheduledTriggerInvocations.tenantId, params.scopes.tenantId),
          eq(scheduledTriggerInvocations.projectId, params.scopes.projectId),
          eq(scheduledTriggerInvocations.agentId, params.scopes.agentId),
          eq(scheduledTriggerInvocations.scheduledTriggerId, params.scheduledTriggerId),
          inArray(scheduledTriggerInvocations.status, ['pending', 'running'])
        )
      )
      .returning();

    return result.length;
  };

/**
 * Cancel only PAST pending invocations for a trigger (scheduledFor <= now)
 * Used when a trigger is disabled - keeps future invocations pending
 */
export const cancelPastPendingInvocationsForTrigger =
  (db: AgentsRunDatabaseClient) =>
  async (params: { scopes: AgentScopeConfig; scheduledTriggerId: string }): Promise<number> => {
    const now = new Date().toISOString();
    const result = await db
      .update(scheduledTriggerInvocations)
      .set({
        status: 'cancelled',
        completedAt: now,
      })
      .where(
        and(
          eq(scheduledTriggerInvocations.tenantId, params.scopes.tenantId),
          eq(scheduledTriggerInvocations.projectId, params.scopes.projectId),
          eq(scheduledTriggerInvocations.agentId, params.scopes.agentId),
          eq(scheduledTriggerInvocations.scheduledTriggerId, params.scheduledTriggerId),
          inArray(scheduledTriggerInvocations.status, ['pending', 'running']),
          lte(scheduledTriggerInvocations.scheduledFor, now) // Only cancel past invocations
        )
      )
      .returning();

    return result.length;
  };

/**
 * Delete all invocations for a scheduled trigger
 * Used for cleanup when a trigger is deleted
 */
export const deleteScheduledTriggerInvocations =
  (db: AgentsRunDatabaseClient) =>
  async (params: { scopes: AgentScopeConfig; scheduledTriggerId: string }): Promise<void> => {
    await db
      .delete(scheduledTriggerInvocations)
      .where(
        and(
          eq(scheduledTriggerInvocations.tenantId, params.scopes.tenantId),
          eq(scheduledTriggerInvocations.projectId, params.scopes.projectId),
          eq(scheduledTriggerInvocations.agentId, params.scopes.agentId),
          eq(scheduledTriggerInvocations.scheduledTriggerId, params.scheduledTriggerId)
        )
      );
  };
