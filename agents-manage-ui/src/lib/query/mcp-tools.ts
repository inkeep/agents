'use client';

import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { fetchMCPTools } from '@/lib/api/tools';
import type { MCPTool } from '@/lib/types/tools';

export function useMcpToolsQuery() {
  'use memo';
  const { tenantId, projectId } = useParams<{ tenantId?: string; projectId?: string }>();

  if (!tenantId || !projectId) {
    throw new Error('tenantId and projectId are required');
  }

  return useQuery<MCPTool[]>({
    queryKey: ['mcp-tools', tenantId, projectId],
    queryFn: () => fetchMCPTools(tenantId, projectId),
    enabled: Boolean(tenantId && projectId),
    staleTime: 30_000,
    initialData: [],
    // force `queryFn` still runs on mount
    initialDataUpdatedAt: 0,
    meta: {
      defaultError: 'Failed to load MCP tools',
    },
  });
}
