import { and, count, desc, eq, isNull } from 'drizzle-orm';
import type { AgentsManageDatabaseClient } from '../../db/manage/manage-client';
import { scheduledWorkflows } from '../../db/manage/manage-schema';
import type { AgentScopeConfig, PaginationConfig } from '../../types/utility';
import type {
  ScheduledWorkflow,
  ScheduledWorkflowInsert,
  ScheduledWorkflowUpdate,
} from '../../validation/schemas';

/**
 * Get a scheduled workflow by ID (agent-scoped)
 */
export const getScheduledWorkflowById =
  (db: AgentsManageDatabaseClient) =>
  async (params: {
    scopes: AgentScopeConfig;
    scheduledWorkflowId: string;
  }): Promise<ScheduledWorkflow | undefined> => {
    const { scopes, scheduledWorkflowId } = params;

    const result = await db.query.scheduledWorkflows.findFirst({
      where: and(
        eq(scheduledWorkflows.tenantId, scopes.tenantId),
        eq(scheduledWorkflows.projectId, scopes.projectId),
        eq(scheduledWorkflows.agentId, scopes.agentId),
        eq(scheduledWorkflows.id, scheduledWorkflowId)
      ),
    });

    return result as ScheduledWorkflow | undefined;
  };

/**
 * Get a scheduled workflow by trigger ID (agent-scoped)
 */
export const getScheduledWorkflowByTriggerId =
  (db: AgentsManageDatabaseClient) =>
  async (params: {
    scopes: AgentScopeConfig;
    scheduledTriggerId: string;
  }): Promise<ScheduledWorkflow | undefined> => {
    const { scopes, scheduledTriggerId } = params;

    const result = await db.query.scheduledWorkflows.findFirst({
      where: and(
        eq(scheduledWorkflows.tenantId, scopes.tenantId),
        eq(scheduledWorkflows.projectId, scopes.projectId),
        eq(scheduledWorkflows.agentId, scopes.agentId),
        eq(scheduledWorkflows.scheduledTriggerId, scheduledTriggerId)
      ),
    });

    return result as ScheduledWorkflow | undefined;
  };

/**
 * List all scheduled workflows for an agent
 */
export const listScheduledWorkflows =
  (db: AgentsManageDatabaseClient) =>
  async (params: { scopes: AgentScopeConfig }): Promise<ScheduledWorkflow[]> => {
    const result = await db.query.scheduledWorkflows.findMany({
      where: and(
        eq(scheduledWorkflows.tenantId, params.scopes.tenantId),
        eq(scheduledWorkflows.projectId, params.scopes.projectId),
        eq(scheduledWorkflows.agentId, params.scopes.agentId)
      ),
    });
    return result as ScheduledWorkflow[];
  };

/**
 * List scheduled workflows for an agent with pagination
 */
export const listScheduledWorkflowsPaginated =
  (db: AgentsManageDatabaseClient) =>
  async (params: { scopes: AgentScopeConfig; pagination?: PaginationConfig }) => {
    const page = params.pagination?.page || 1;
    const limit = Math.min(params.pagination?.limit || 10, 100);
    const offset = (page - 1) * limit;

    const whereClause = and(
      eq(scheduledWorkflows.tenantId, params.scopes.tenantId),
      eq(scheduledWorkflows.projectId, params.scopes.projectId),
      eq(scheduledWorkflows.agentId, params.scopes.agentId)
    );

    const [data, totalResult] = await Promise.all([
      db
        .select()
        .from(scheduledWorkflows)
        .where(whereClause)
        .limit(limit)
        .offset(offset)
        .orderBy(desc(scheduledWorkflows.createdAt)),
      db.select({ count: count() }).from(scheduledWorkflows).where(whereClause),
    ]);

    const total = totalResult[0]?.count || 0;
    const pages = Math.ceil(total / limit);

    return {
      data,
      pagination: { page, limit, total, pages },
    };
  };

/**
 * List workflows without active workflow run IDs (orphaned workflows)
 * Useful for watchdog to detect workflows needing restart
 */
export const listWorkflowsWithoutRunId =
  (db: AgentsManageDatabaseClient) => async (): Promise<ScheduledWorkflow[]> => {
    const result = await db.query.scheduledWorkflows.findMany({
      where: isNull(scheduledWorkflows.workflowRunId),
    });
    return result as ScheduledWorkflow[];
  };

/**
 * Create a new scheduled workflow (agent-scoped)
 */
export const createScheduledWorkflow =
  (db: AgentsManageDatabaseClient) =>
  async (params: ScheduledWorkflowInsert): Promise<ScheduledWorkflow> => {
    const result = await db
      .insert(scheduledWorkflows)
      .values(params as any)
      .returning();
    return result[0] as ScheduledWorkflow;
  };

/**
 * Update a scheduled workflow (agent-scoped)
 */
export const updateScheduledWorkflow =
  (db: AgentsManageDatabaseClient) =>
  async (params: {
    scopes: AgentScopeConfig;
    scheduledWorkflowId: string;
    data: ScheduledWorkflowUpdate;
  }): Promise<ScheduledWorkflow> => {
    const updateData = {
      ...params.data,
      updatedAt: new Date().toISOString(),
    } as ScheduledWorkflowUpdate;

    const result = await db
      .update(scheduledWorkflows)
      .set(updateData as any)
      .where(
        and(
          eq(scheduledWorkflows.tenantId, params.scopes.tenantId),
          eq(scheduledWorkflows.projectId, params.scopes.projectId),
          eq(scheduledWorkflows.agentId, params.scopes.agentId),
          eq(scheduledWorkflows.id, params.scheduledWorkflowId)
        )
      )
      .returning();

    return result[0] as ScheduledWorkflow;
  };

/**
 * Update workflow run ID and/or status for a scheduled workflow
 * Used when a workflow is started/restarted/cancelled
 */
export const updateScheduledWorkflowRunId =
  (db: AgentsManageDatabaseClient) =>
  async (params: {
    scopes: AgentScopeConfig;
    scheduledWorkflowId: string;
    workflowRunId: string | null;
    status?: 'running' | 'completed' | 'cancelled' | 'failed';
  }): Promise<ScheduledWorkflow> => {
    const updateData: Record<string, unknown> = {
      workflowRunId: params.workflowRunId,
      updatedAt: new Date().toISOString(),
    };

    if (params.status) {
      updateData.status = params.status;
    }

    const result = await db
      .update(scheduledWorkflows)
      .set(updateData)
      .where(
        and(
          eq(scheduledWorkflows.tenantId, params.scopes.tenantId),
          eq(scheduledWorkflows.projectId, params.scopes.projectId),
          eq(scheduledWorkflows.agentId, params.scopes.agentId),
          eq(scheduledWorkflows.id, params.scheduledWorkflowId)
        )
      )
      .returning();

    return result[0] as ScheduledWorkflow;
  };

/**
 * Delete a scheduled workflow (agent-scoped)
 */
export const deleteScheduledWorkflow =
  (db: AgentsManageDatabaseClient) =>
  async (params: { scopes: AgentScopeConfig; scheduledWorkflowId: string }): Promise<void> => {
    await db
      .delete(scheduledWorkflows)
      .where(
        and(
          eq(scheduledWorkflows.tenantId, params.scopes.tenantId),
          eq(scheduledWorkflows.projectId, params.scopes.projectId),
          eq(scheduledWorkflows.agentId, params.scopes.agentId),
          eq(scheduledWorkflows.id, params.scheduledWorkflowId)
        )
      );
  };

/**
 * Upsert a scheduled workflow (create or update based on existence)
 */
export const upsertScheduledWorkflow =
  (db: AgentsManageDatabaseClient) =>
  async (params: {
    scopes: AgentScopeConfig;
    data: ScheduledWorkflowInsert;
  }): Promise<ScheduledWorkflow> => {
    const { scopes, data } = params;

    // Check if workflow exists
    const existing = await db.query.scheduledWorkflows.findFirst({
      where: and(
        eq(scheduledWorkflows.tenantId, scopes.tenantId),
        eq(scheduledWorkflows.projectId, scopes.projectId),
        eq(scheduledWorkflows.agentId, scopes.agentId),
        eq(scheduledWorkflows.id, data.id)
      ),
    });

    if (existing) {
      // Update existing workflow
      const updateData = {
        ...data,
        updatedAt: new Date().toISOString(),
      };
      const result = await db
        .update(scheduledWorkflows)
        .set(updateData as any)
        .where(
          and(
            eq(scheduledWorkflows.tenantId, scopes.tenantId),
            eq(scheduledWorkflows.projectId, scopes.projectId),
            eq(scheduledWorkflows.agentId, scopes.agentId),
            eq(scheduledWorkflows.id, data.id)
          )
        )
        .returning();
      return result[0] as ScheduledWorkflow;
    }

    // Create new workflow
    const result = await db
      .insert(scheduledWorkflows)
      .values({
        ...data,
        tenantId: scopes.tenantId,
        projectId: scopes.projectId,
        agentId: scopes.agentId,
      } as any)
      .returning();
    return result[0] as ScheduledWorkflow;
  };
