export const projectQueryKeys = {
  all: ['projects'] as const,
  tenant: (tenantId: string) => [...projectQueryKeys.all, tenantId] as const,
  list: (tenantId: string) => [...projectQueryKeys.tenant(tenantId), 'list'] as const,
  detail: (tenantId: string, projectId: string) =>
    [...projectQueryKeys.tenant(tenantId), projectId] as const,
  permissions: (tenantId: string, projectId: string) =>
    [...projectQueryKeys.detail(tenantId, projectId), 'permissions'] as const,
};
