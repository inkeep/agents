export const mcpToolQueryKeys = {
  all: ['mcp-tools'] as const,
  project: (tenantId: string, projectId: string) => ['mcp-tools', tenantId, projectId] as const,
  list: (tenantId: string, projectId: string, skipDiscovery = false) =>
    ['mcp-tools', tenantId, projectId, skipDiscovery ? 'skip-discovery' : 'full'] as const,
  status: (tenantId: string, projectId: string, toolId: string) =>
    ['mcp-tool-status', tenantId, projectId, toolId] as const,
};
