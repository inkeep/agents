import type { AgentsManageDatabaseClient } from '../../db/manage/manage-client';
import {
  agents as agentsTable,
  contextConfigs as contextConfigsTable,
  tools as toolsTable,
} from '../../db/manage/manage-schema';
import type { ProjectScopeConfig } from '../../types/utility';
import { projectScopedWhere } from './scope-helpers';

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
