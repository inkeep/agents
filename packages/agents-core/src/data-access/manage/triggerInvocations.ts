import { and, count, desc, eq, gte, lte } from 'drizzle-orm';
import type { AgentsManageDatabaseClient } from '../../db/manage/manage-client';
import { triggerInvocations } from '../../db/manage/manage-schema';
import type {
  TriggerInvocationInsert,
  TriggerInvocationSelect,
  TriggerInvocationUpdate,
} from '../../types/entities';
import type { AgentScopeConfig, PaginationConfig } from '../../types/utility';

/**
 * Get a trigger invocation by ID (agent-scoped)
 */
export const getTriggerInvocationById =
  (db: AgentsManageDatabaseClient) =>
  async (params: {
    scopes: AgentScopeConfig;
    triggerId: string;
    invocationId: string;
  }): Promise<TriggerInvocationSelect | undefined> => {
    const result = await db.query.triggerInvocations.findFirst({
      where: and(
        eq(triggerInvocations.tenantId, params.scopes.tenantId),
        eq(triggerInvocations.projectId, params.scopes.projectId),
        eq(triggerInvocations.agentId, params.scopes.agentId),
        eq(triggerInvocations.triggerId, params.triggerId),
        eq(triggerInvocations.id, params.invocationId)
      ),
    });
    return result as TriggerInvocationSelect | undefined;
  };

/**
 * List trigger invocations with optional filtering (agent-scoped)
 */
export const listTriggerInvocationsPaginated =
  (db: AgentsManageDatabaseClient) =>
  async (params: {
    scopes: AgentScopeConfig;
    triggerId: string;
    pagination?: PaginationConfig;
    filters?: {
      status?: 'pending' | 'success' | 'failed';
      from?: string; // ISO 8601 date string
      to?: string; // ISO 8601 date string
    };
  }) => {
    const page = params.pagination?.page || 1;
    const limit = Math.min(params.pagination?.limit || 10, 100);
    const offset = (page - 1) * limit;

    const conditions = [
      eq(triggerInvocations.tenantId, params.scopes.tenantId),
      eq(triggerInvocations.projectId, params.scopes.projectId),
      eq(triggerInvocations.agentId, params.scopes.agentId),
      eq(triggerInvocations.triggerId, params.triggerId),
    ];

    // Add optional filters
    if (params.filters?.status) {
      conditions.push(eq(triggerInvocations.status, params.filters.status));
    }
    if (params.filters?.from) {
      conditions.push(gte(triggerInvocations.createdAt, params.filters.from));
    }
    if (params.filters?.to) {
      conditions.push(lte(triggerInvocations.createdAt, params.filters.to));
    }

    const whereClause = and(...conditions);

    const [data, totalResult] = await Promise.all([
      db
        .select()
        .from(triggerInvocations)
        .where(whereClause)
        .limit(limit)
        .offset(offset)
        .orderBy(desc(triggerInvocations.createdAt)),
      db.select({ count: count() }).from(triggerInvocations).where(whereClause),
    ]);

    const total = totalResult[0]?.count || 0;
    const pages = Math.ceil(total / limit);

    return {
      data,
      pagination: { page, limit, total, pages },
    };
  };

/**
 * Create a new trigger invocation (agent-scoped)
 */
export const createTriggerInvocation =
  (db: AgentsManageDatabaseClient) =>
  async (params: TriggerInvocationInsert): Promise<TriggerInvocationSelect> => {
    const result = await db.insert(triggerInvocations).values(params).returning();
    return result[0] as TriggerInvocationSelect;
  };

/**
 * Update trigger invocation status (agent-scoped)
 */
export const updateTriggerInvocationStatus =
  (db: AgentsManageDatabaseClient) =>
  async (params: {
    scopes: AgentScopeConfig;
    triggerId: string;
    invocationId: string;
    data: TriggerInvocationUpdate;
  }): Promise<TriggerInvocationSelect> => {
    const result = await db
      .update(triggerInvocations)
      .set(params.data)
      .where(
        and(
          eq(triggerInvocations.tenantId, params.scopes.tenantId),
          eq(triggerInvocations.projectId, params.scopes.projectId),
          eq(triggerInvocations.agentId, params.scopes.agentId),
          eq(triggerInvocations.triggerId, params.triggerId),
          eq(triggerInvocations.id, params.invocationId)
        )
      )
      .returning();

    return result[0] as TriggerInvocationSelect;
  };
