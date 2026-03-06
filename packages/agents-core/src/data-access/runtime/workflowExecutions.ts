import { and, eq, inArray } from 'drizzle-orm';
import type { AgentsRunDatabaseClient } from '../../db/runtime/runtime-client';
import { workflowExecutions } from '../../db/runtime/runtime-schema';
import type { ProjectScopeConfig } from '../../types/index';

export type WorkflowExecutionStatus = 'starting' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface WorkflowExecutionInsert {
  id: string;
  tenantId: string;
  projectId: string;
  runId?: string | null;
  agentId: string;
  conversationId?: string | null;
  status: WorkflowExecutionStatus;
}

export interface WorkflowExecutionUpdate {
  id: string;
  runId?: string | null;
  status?: WorkflowExecutionStatus;
}

export const createWorkflowExecution =
  (db: AgentsRunDatabaseClient) => async (params: WorkflowExecutionInsert) => {
    const [result] = await db
      .insert(workflowExecutions)
      .values({
        id: params.id,
        tenantId: params.tenantId,
        projectId: params.projectId,
        runId: params.runId ?? null,
        agentId: params.agentId,
        conversationId: params.conversationId ?? null,
        status: params.status,
      })
      .returning();
    return result;
  };

export const updateWorkflowExecution =
  (db: AgentsRunDatabaseClient) => async (params: WorkflowExecutionUpdate) => {
    const updates: Record<string, unknown> = {};
    if (params.runId !== undefined) updates.runId = params.runId;
    if (params.status !== undefined) updates.status = params.status;
    updates.updatedAt = new Date().toISOString();

    const [result] = await db
      .update(workflowExecutions)
      .set(updates)
      .where(eq(workflowExecutions.id, params.id))
      .returning();
    return result;
  };

export const getWorkflowExecution =
  (db: AgentsRunDatabaseClient) =>
  async (params: { scopes: ProjectScopeConfig; runId: string }) => {
    const [result] = await db
      .select()
      .from(workflowExecutions)
      .where(
        and(
          eq(workflowExecutions.tenantId, params.scopes.tenantId),
          eq(workflowExecutions.projectId, params.scopes.projectId),
          eq(workflowExecutions.runId, params.runId)
        )
      )
      .limit(1);
    return result ?? null;
  };

export const getActiveWorkflowExecution =
  (db: AgentsRunDatabaseClient) =>
  async (params: { scopes: ProjectScopeConfig; conversationId: string }) => {
    const [result] = await db
      .select()
      .from(workflowExecutions)
      .where(
        and(
          eq(workflowExecutions.tenantId, params.scopes.tenantId),
          eq(workflowExecutions.projectId, params.scopes.projectId),
          eq(workflowExecutions.conversationId, params.conversationId),
          inArray(workflowExecutions.status, ['starting', 'running'])
        )
      )
      .limit(1);
    return result ?? null;
  };
