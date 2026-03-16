import { and, count, desc, eq, sql } from 'drizzle-orm';
import type { AgentsManageDatabaseClient } from '../../db/manage/manage-client';
import { scheduledTriggers } from '../../db/manage/manage-schema';
import { getProjectScopedRef } from '../../dolt/ref-helpers';
import type { AgentScopeConfig, PaginationConfig } from '../../types/utility';
import { getLogger } from '../../utils/logger';
import type {
  ScheduledTrigger,
  ScheduledTriggerInsert,
  ScheduledTriggerUpdate,
} from '../../validation/schemas';

const logger = getLogger('scheduledTriggers');

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
 * Create a new scheduled trigger (agent-scoped)
 */
export const createScheduledTrigger =
  (db: AgentsManageDatabaseClient) =>
  async (
    params: ScheduledTriggerInsert & { nextRunAt?: string | null }
  ): Promise<ScheduledTrigger> => {
    const result = await db.insert(scheduledTriggers).values(params).returning();
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
 * Upsert a scheduled trigger (create if it doesn't exist, update if it does)
 */
export const upsertScheduledTrigger =
  (db: AgentsManageDatabaseClient) =>
  async (params: {
    scopes: AgentScopeConfig;
    data: ScheduledTriggerInsert;
  }): Promise<ScheduledTrigger> => {
    const existing = await getScheduledTriggerById(db)({
      scopes: params.scopes,
      scheduledTriggerId: params.data.id,
    });

    if (existing) {
      return await updateScheduledTrigger(db)({
        scopes: params.scopes,
        scheduledTriggerId: params.data.id,
        data: params.data,
      });
    }

    return await createScheduledTrigger(db)(params.data);
  };

/**
 * Delete all scheduled triggers for a given runAsUserId within a tenant+project scope.
 * Operates across all agents in the project (not agent-scoped).
 */
export const deleteScheduledTriggersByRunAsUserId =
  (db: AgentsManageDatabaseClient) =>
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

/**
 * List all scheduled triggers for an agent (non-paginated, used by agentFull)
 */
export const listScheduledTriggers =
  (db: AgentsManageDatabaseClient) =>
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

    return result as ScheduledTrigger[];
  };

export type DueScheduledTrigger = {
  id: string;
  tenantId: string;
  projectId: string;
  agentId: string;
  cronExpression: string | null;
  cronTimezone: string | null;
  runAt: string | null;
  nextRunAt: string | null;
  enabled: boolean;
};

/**
 * Query due scheduled triggers across all project branches using AS OF syntax.
 * Iterates over each project's main branch and returns triggers where
 * enabled = true AND next_run_at <= asOf.
 */
export const findDueScheduledTriggersAcrossProjects =
  (db: AgentsManageDatabaseClient) =>
  async (params: {
    projects: Array<{ tenantId: string; projectId: string }>;
    asOf: string;
  }): Promise<DueScheduledTrigger[]> => {
    const allDue: DueScheduledTrigger[] = [];

    for (const project of params.projects) {
      const branchName = getProjectScopedRef(project.tenantId, project.projectId, 'main');

      try {
        const rows = await db.execute(
          sql`SELECT id, tenant_id, project_id, agent_id,
                     cron_expression, cron_timezone, run_at,
                     next_run_at, enabled
              FROM scheduled_triggers AS OF ${sql.raw(`'${branchName}'`)}
              WHERE enabled = true
                AND next_run_at IS NOT NULL
                AND next_run_at <= ${params.asOf}`
        );

        for (const row of rows.rows) {
          allDue.push({
            id: row.id as string,
            tenantId: row.tenant_id as string,
            projectId: row.project_id as string,
            agentId: row.agent_id as string,
            cronExpression: row.cron_expression as string | null,
            cronTimezone: row.cron_timezone as string | null,
            runAt: row.run_at as string | null,
            nextRunAt: row.next_run_at as string | null,
            enabled: row.enabled as boolean,
          });
        }
      } catch (err) {
        logger.warn(
          { tenantId: project.tenantId, projectId: project.projectId, err },
          'Failed to query due triggers for project branch, skipping'
        );
      }
    }

    return allDue;
  };

/**
 * Advance the next_run_at timestamp for a scheduled trigger.
 * Must be called within a withRef scope on the project's main branch.
 */
export const advanceScheduledTriggerNextRunAt =
  (db: AgentsManageDatabaseClient) =>
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
