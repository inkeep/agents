import { and, eq } from 'drizzle-orm';
import type {
  AgentScopeConfig,
  ProjectScopeConfig,
  SubAgentScopeConfig,
} from '../../types/utility';

type TenantScopeConfig = { tenantId: string };

type TenantScopedColumns = { tenantId: any };
type ProjectScopedColumns = TenantScopedColumns & { projectId: any };
type AgentScopedColumns = ProjectScopedColumns & { agentId: any };
type SubAgentScopedColumns = AgentScopedColumns & { subAgentId: any };

export function tenantScopedWhere<T extends TenantScopedColumns>(
  table: T,
  scopes: TenantScopeConfig
) {
  return eq(table.tenantId, scopes.tenantId);
}

export function projectScopedWhere<T extends ProjectScopedColumns>(
  table: T,
  scopes: ProjectScopeConfig
) {
  return and(eq(table.tenantId, scopes.tenantId), eq(table.projectId, scopes.projectId));
}

export function agentScopedWhere<T extends AgentScopedColumns>(table: T, scopes: AgentScopeConfig) {
  return and(
    eq(table.tenantId, scopes.tenantId),
    eq(table.projectId, scopes.projectId),
    eq(table.agentId, scopes.agentId)
  );
}

export function subAgentScopedWhere<T extends SubAgentScopedColumns>(
  table: T,
  scopes: SubAgentScopeConfig
) {
  return and(
    eq(table.tenantId, scopes.tenantId),
    eq(table.projectId, scopes.projectId),
    eq(table.agentId, scopes.agentId),
    eq(table.subAgentId, scopes.subAgentId)
  );
}
