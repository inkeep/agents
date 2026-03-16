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
import { projectScopedWhere } from './scope-helpers';

export const listEnabledScheduledTriggers =
  (db: AgentsManageDatabaseClient) => async (params: { scopes: ProjectScopeConfig }) => {
    return db
      .select({
        id: scheduledTriggers.id,
        name: scheduledTriggers.name,
        nextRunAt: scheduledTriggers.nextRunAt,
      })
      .from(scheduledTriggers)
      .where(
        and(
          projectScopedWhere(scheduledTriggers, params.scopes),
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
      .where(projectScopedWhere(scheduledWorkflows, params.scopes));
  };

export const listToolIdsByProject =
  (db: AgentsManageDatabaseClient) => async (params: { scopes: ProjectScopeConfig }) => {
    const rows = await db
      .select({ id: toolsTable.id })
      .from(toolsTable)
      .where(projectScopedWhere(toolsTable, params.scopes));
    return rows.map((r) => r.id);
  };

export const listContextConfigIdsByProject =
  (db: AgentsManageDatabaseClient) => async (params: { scopes: ProjectScopeConfig }) => {
    const rows = await db
      .select({ id: contextConfigsTable.id })
      .from(contextConfigsTable)
      .where(projectScopedWhere(contextConfigsTable, params.scopes));
    return rows.map((r) => r.id);
  };

export const listAgentIdsByProject =
  (db: AgentsManageDatabaseClient) => async (params: { scopes: ProjectScopeConfig }) => {
    const rows = await db
      .select({ id: agentsTable.id })
      .from(agentsTable)
      .where(projectScopedWhere(agentsTable, params.scopes));
    return rows.map((r) => r.id);
  };
