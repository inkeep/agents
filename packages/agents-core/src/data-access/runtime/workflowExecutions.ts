import { and, eq } from 'drizzle-orm';
import type { AgentsRunDatabaseClient } from '../../db/runtime/runtime-client';
import { workflowExecutions } from '../../db/runtime/runtime-schema';
import type { WorkflowExecutionInsert, WorkflowExecutionSelect } from '../../types/index';

export const createWorkflowExecution =
  (db: AgentsRunDatabaseClient) =>
  async (params: WorkflowExecutionInsert): Promise<WorkflowExecutionSelect> => {
    const now = new Date().toISOString();

    const [created] = await db
      .insert(workflowExecutions)
      .values({
        ...params,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return created as WorkflowExecutionSelect;
  };

export const getWorkflowExecution =
  (db: AgentsRunDatabaseClient) =>
  async (params: {
    tenantId: string;
    projectId: string;
    id: string;
  }): Promise<WorkflowExecutionSelect | null> => {
    const result = await db
      .select()
      .from(workflowExecutions)
      .where(
        and(
          eq(workflowExecutions.tenantId, params.tenantId),
          eq(workflowExecutions.projectId, params.projectId),
          eq(workflowExecutions.id, params.id)
        )
      )
      .limit(1);

    return (result[0] as WorkflowExecutionSelect) ?? null;
  };

export const getWorkflowExecutionByConversation =
  (db: AgentsRunDatabaseClient) =>
  async (params: {
    tenantId: string;
    projectId: string;
    conversationId: string;
  }): Promise<WorkflowExecutionSelect | null> => {
    const result = await db
      .select()
      .from(workflowExecutions)
      .where(
        and(
          eq(workflowExecutions.tenantId, params.tenantId),
          eq(workflowExecutions.projectId, params.projectId),
          eq(workflowExecutions.conversationId, params.conversationId)
        )
      )
      .orderBy(workflowExecutions.createdAt)
      .limit(1);

    return (result[0] as WorkflowExecutionSelect) ?? null;
  };

export const updateWorkflowExecutionStatus =
  (db: AgentsRunDatabaseClient) =>
  async (params: {
    tenantId: string;
    projectId: string;
    id: string;
    status: 'running' | 'suspended' | 'completed' | 'failed';
    metadata?: Record<string, unknown>;
  }): Promise<WorkflowExecutionSelect | null> => {
    const now = new Date().toISOString();

    const updateData: Record<string, unknown> = {
      status: params.status,
      updatedAt: now,
    };

    if (params.metadata !== undefined) {
      updateData.metadata = params.metadata;
    }

    const [updated] = await db
      .update(workflowExecutions)
      .set(updateData)
      .where(
        and(
          eq(workflowExecutions.tenantId, params.tenantId),
          eq(workflowExecutions.projectId, params.projectId),
          eq(workflowExecutions.id, params.id)
        )
      )
      .returning();

    return (updated as WorkflowExecutionSelect) ?? null;
  };
