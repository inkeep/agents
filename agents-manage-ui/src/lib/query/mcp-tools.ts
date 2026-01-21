'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchMCPTools } from '@/lib/api/tools';
import type { MCPTool } from '@/lib/types/tools';

const mcpToolsQueryKeys = {
  list: (tenantId: string, projectId: string) => ['mcp-tools', tenantId, projectId] as const,
};

export function useMcpToolsQuery(tenantId: string, projectId: string) {
  return useQuery<MCPTool[]>({
    queryKey: mcpToolsQueryKeys.list(tenantId, projectId),
    queryFn: () => fetchMCPTools(tenantId, projectId),
    enabled: Boolean(tenantId && projectId),
    staleTime: 30_000,
    initialData: [],
    // force `queryFn` still runs on mount
    initialDataUpdatedAt: 0,
  });
}
