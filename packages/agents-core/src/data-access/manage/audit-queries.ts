import { and, eq } from 'drizzle-orm';
import type { AgentsManageDatabaseClient } from '../../db/manage/manage-client';
import {
  agents as agentsTable,
  contextConfigs as contextConfigsTable,
  scheduledTriggers,
  scheduledWorkflows,
  tools as toolsTable,
} from '../../db/manage/manage-schema';
import type { ProjectScopeConfig } from '../../types/utility';

export const listEnabledScheduledTriggers =
  (db: AgentsManageDatabaseClient) => async (params: { scopes: ProjectScopeConfig }) => {
    return db
      .select({ id: scheduledTriggers.id, name: scheduledTriggers.name })
      .from(scheduledTriggers)
      .where(
        and(
          eq(scheduledTriggers.tenantId, params.scopes.tenantId),
          eq(scheduledTriggers.projectId, params.scopes.projectId),
          eq(scheduledTriggers.enabled, true)
        )
      );
  };

export const listScheduledWorkflowsByProject =
  (db: AgentsManageDatabaseClient) => async (params: { scopes: ProjectScopeConfig }) => {
    return db
      .select({
        id: scheduledWorkflows.id,
        workflowRunId: scheduledWorkflows.workflowRunId,
        scheduledTriggerId: scheduledWorkflows.scheduledTriggerId,
      })
      .from(scheduledWorkflows)
      .where(
        and(
          eq(scheduledWorkflows.tenantId, params.scopes.tenantId),
          eq(scheduledWorkflows.projectId, params.scopes.projectId)
        )
      );
  };

export const listToolIdsByProject =
  (db: AgentsManageDatabaseClient) => async (params: { scopes: ProjectScopeConfig }) => {
    const rows = await db
      .select({ id: toolsTable.id })
      .from(toolsTable)
      .where(
        and(
          eq(toolsTable.tenantId, params.scopes.tenantId),
          eq(toolsTable.projectId, params.scopes.projectId)
        )
      );
    return rows.map((r) => r.id);
  };

export const listContextConfigIdsByProject =
  (db: AgentsManageDatabaseClient) => async (params: { scopes: ProjectScopeConfig }) => {
    const rows = await db
      .select({ id: contextConfigsTable.id })
      .from(contextConfigsTable)
      .where(
        and(
          eq(contextConfigsTable.tenantId, params.scopes.tenantId),
          eq(contextConfigsTable.projectId, params.scopes.projectId)
        )
      );
    return rows.map((r) => r.id);
  };

export const listAgentIdsByProject =
  (db: AgentsManageDatabaseClient) => async (params: { scopes: ProjectScopeConfig }) => {
    const rows = await db
      .select({ id: agentsTable.id })
      .from(agentsTable)
      .where(
        and(
          eq(agentsTable.tenantId, params.scopes.tenantId),
          eq(agentsTable.projectId, params.scopes.projectId)
        )
      );
    return rows.map((r) => r.id);
  };
