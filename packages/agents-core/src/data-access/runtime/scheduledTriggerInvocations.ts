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
  }): Promise<ScheduledTriggerInvocation> => {
    const now = new Date().toISOString();
    const result = await db
      .update(scheduledTriggerInvocations)
      .set({
        status: 'running',
        startedAt: sql`COALESCE(${scheduledTriggerInvocations.startedAt}, ${now})`,
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
  }): Promise<ScheduledTriggerInvocation | undefined> => {
    const result = await db
      .update(scheduledTriggerInvocations)
      .set({
        status: 'completed',
        completedAt: new Date().toISOString(),
      })
      .where(
        and(
          eq(scheduledTriggerInvocations.tenantId, params.scopes.tenantId),
          eq(scheduledTriggerInvocations.projectId, params.scopes.projectId),
          eq(scheduledTriggerInvocations.agentId, params.scopes.agentId),
          eq(scheduledTriggerInvocations.scheduledTriggerId, params.scheduledTriggerId),
          eq(scheduledTriggerInvocations.id, params.invocationId),
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
  }): Promise<ScheduledTriggerInvocation | undefined> => {
    const result = await db
      .update(scheduledTriggerInvocations)
      .set({
        status: 'failed',
        completedAt: new Date().toISOString(),
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
 * Add a conversation ID to the invocation's conversationIds array
 * Used to track all conversations created during retries
 */
export const addConversationIdToInvocation =
  (db: AgentsRunDatabaseClient) =>
  async (params: {
    scopes: AgentScopeConfig;
    scheduledTriggerId: string;
    invocationId: string;
    conversationId: string;
  }): Promise<ScheduledTriggerInvocation | undefined> => {
    // First, get the current invocation to access existing conversationIds
    const current = await db.query.scheduledTriggerInvocations.findFirst({
      where: and(
        eq(scheduledTriggerInvocations.tenantId, params.scopes.tenantId),
        eq(scheduledTriggerInvocations.projectId, params.scopes.projectId),
        eq(scheduledTriggerInvocations.agentId, params.scopes.agentId),
        eq(scheduledTriggerInvocations.scheduledTriggerId, params.scheduledTriggerId),
        eq(scheduledTriggerInvocations.id, params.invocationId)
      ),
    });

    const existingIds = (current?.conversationIds as string[]) || [];
    const newConversationIds = [...existingIds, params.conversationId];

    const result = await db
      .update(scheduledTriggerInvocations)
      .set({
        conversationIds: newConversationIds,
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
 * Get run info for multiple scheduled triggers in a single query
 * Returns last run (completed/failed) and next pending run for each trigger
 */
export const getScheduledTriggerRunInfoBatch =
  (db: AgentsRunDatabaseClient) =>
  async (params: {
    scopes: Omit<AgentScopeConfig, 'agentId'>;
    triggerIds: Array<{ agentId: string; triggerId: string }>;
  }): Promise<
    Map<
      string,
      {
        lastRunAt: string | null;
        lastRunStatus: 'completed' | 'failed' | null;
        lastRunConversationIds: string[];
        nextRunAt: string | null;
      }
    >
  > => {
    if (params.triggerIds.length === 0) {
      return new Map();
    }

    const { tenantId, projectId } = params.scopes;
    const allInvocations = await db
      .select({
        scheduledTriggerId: scheduledTriggerInvocations.scheduledTriggerId,
        status: scheduledTriggerInvocations.status,
        scheduledFor: scheduledTriggerInvocations.scheduledFor,
        completedAt: scheduledTriggerInvocations.completedAt,
        conversationIds: scheduledTriggerInvocations.conversationIds,
      })
      .from(scheduledTriggerInvocations)
      .where(
        and(
          eq(scheduledTriggerInvocations.tenantId, tenantId),
          eq(scheduledTriggerInvocations.projectId, projectId),
          inArray(
            scheduledTriggerInvocations.scheduledTriggerId,
            params.triggerIds.map((t) => t.triggerId)
          )
        )
      )
      .orderBy(desc(scheduledTriggerInvocations.completedAt));

    const result = new Map<
      string,
      {
        lastRunAt: string | null;
        lastRunStatus: 'completed' | 'failed' | null;
        lastRunConversationIds: string[];
        nextRunAt: string | null;
      }
    >();

    for (const trigger of params.triggerIds) {
      result.set(trigger.triggerId, {
        lastRunAt: null,
        lastRunStatus: null,
        lastRunConversationIds: [],
        nextRunAt: null,
      });
    }

    for (const inv of allInvocations) {
      const triggerInfo = result.get(inv.scheduledTriggerId);
      if (!triggerInfo) continue;
      if (inv.status === 'pending' && !triggerInfo.nextRunAt) {
        triggerInfo.nextRunAt = inv.scheduledFor;
      }
      if ((inv.status === 'completed' || inv.status === 'failed') && !triggerInfo.lastRunAt) {
        triggerInfo.lastRunAt = inv.completedAt;
        triggerInfo.lastRunStatus = inv.status;
        triggerInfo.lastRunConversationIds = (inv.conversationIds as string[]) || [];
      }
    }

    return result;
  };

/**
 * List upcoming invocations across ALL triggers for an agent with pagination
 * Used for the upcoming runs dashboard with full pagination support
 */
export const listUpcomingInvocationsForAgentPaginated =
  (db: AgentsRunDatabaseClient) =>
  async (params: {
    scopes: Omit<AgentScopeConfig, 'agentId'> & { agentId: string };
    pagination?: PaginationConfig;
    includeRunning?: boolean;
  }) => {
    const page = params.pagination?.page || 1;
    const limit = Math.min(params.pagination?.limit || 20, 100);
    const offset = (page - 1) * limit;

    console.log('[listUpcomingInvocationsForAgentPaginated] Query params:', {
      tenantId: params.scopes.tenantId,
      projectId: params.scopes.projectId,
      agentId: params.scopes.agentId,
      includeRunning: params.includeRunning,
      page,
      limit,
    });

    // Include running invocations if requested (for dashboard showing active + upcoming)
    const statusCondition = params.includeRunning
      ? inArray(scheduledTriggerInvocations.status, ['pending', 'running'])
      : eq(scheduledTriggerInvocations.status, 'pending');

    const conditions = [
      eq(scheduledTriggerInvocations.tenantId, params.scopes.tenantId),
      eq(scheduledTriggerInvocations.projectId, params.scopes.projectId),
      eq(scheduledTriggerInvocations.agentId, params.scopes.agentId),
      statusCondition,
    ];

    const whereClause = and(...conditions);

    const [data, totalResult] = await Promise.all([
      db
        .select()
        .from(scheduledTriggerInvocations)
        .where(whereClause)
        .limit(limit)
        .offset(offset)
        .orderBy(asc(scheduledTriggerInvocations.scheduledFor)),
      db.select({ count: count() }).from(scheduledTriggerInvocations).where(whereClause),
    ]);

    const total = totalResult[0]?.count || 0;
    const pages = Math.ceil(total / limit);

    console.log('[listUpcomingInvocationsForAgentPaginated] Results:', {
      dataCount: data.length,
      total,
      firstItem: data[0]
        ? { id: data[0].id, status: data[0].status, scheduledFor: data[0].scheduledFor }
        : null,
    });

    return {
      data,
      pagination: { page, limit, total, pages },
    };
  };

/**
 * List all invocations across ALL triggers for a PROJECT with pagination
 * Used for the project-level invocations dashboard
 */
export const listProjectScheduledTriggerInvocationsPaginated =
  (db: AgentsRunDatabaseClient) =>
  async (params: {
    scopes: Omit<AgentScopeConfig, 'agentId'>;
    pagination?: PaginationConfig;
    filters?: {
      status?: ScheduledTriggerInvocationStatus;
    };
  }) => {
    const page = params.pagination?.page || 1;
    const limit = Math.min(params.pagination?.limit || 20, 100);
    const offset = (page - 1) * limit;

    const conditions = [
      eq(scheduledTriggerInvocations.tenantId, params.scopes.tenantId),
      eq(scheduledTriggerInvocations.projectId, params.scopes.projectId),
    ];

    if (params.filters?.status) {
      conditions.push(eq(scheduledTriggerInvocations.status, params.filters.status));
    }

    const whereClause = and(...conditions);

    const [data, totalResult] = await Promise.all([
      db
        .select()
        .from(scheduledTriggerInvocations)
        .where(whereClause)
        .limit(limit)
        .offset(offset)
        .orderBy(desc(scheduledTriggerInvocations.createdAt)),
      db.select({ count: count() }).from(scheduledTriggerInvocations).where(whereClause),
    ]);

    const total = totalResult[0]?.count || 0;
    const pages = Math.ceil(total / limit);

    return {
      data,
      pagination: { page, limit, total, pages },
    };
  };
