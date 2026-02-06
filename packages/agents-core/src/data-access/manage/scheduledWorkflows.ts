import { and, eq } from 'drizzle-orm';
import type { AgentsManageDatabaseClient } from '../../db/manage/manage-client';
import { scheduledWorkflows } from '../../db/manage/manage-schema';
import type { AgentScopeConfig } from '../../types/utility';
import type { ScheduledWorkflow, ScheduledWorkflowInsert } from '../../validation/schemas';

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
