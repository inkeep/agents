'use client';

import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { useRuntimeConfig } from '@/contexts/runtime-config';
import { fetchMCPTools } from '@/lib/api/tools';
import type { MCPTool } from '@/lib/types/tools';

export function useMcpToolsQuery({ enabled = true }: { enabled?: boolean } = {}) {
  'use memo';
  const { tenantId, projectId } = useParams<{ tenantId?: string; projectId?: string }>();

  if (!tenantId || !projectId) {
    throw new Error('tenantId and projectId are required');
  }

  return useQuery<MCPTool[]>({
    queryKey: ['mcp-tools', tenantId, projectId],
    queryFn: () => fetchMCPTools(tenantId, projectId),
    enabled,
    staleTime: 30_000,
    initialData: [],
    // force `queryFn` still runs on mount
    initialDataUpdatedAt: 0,
    meta: {
      defaultError: 'Failed to load MCP tools',
    },
  });
}

/**
 * Fetches a single MCP tool's status using client-side fetch.
 * This enables true parallel fetching when multiple components call this hook,
 * unlike server actions which get serialized.
 */
export function useMcpToolStatusQuery({
  tenantId,
  projectId,
  toolId,
  enabled = true,
}: {
  tenantId: string;
  projectId: string;
  toolId: string;
  enabled?: boolean;
}) {
  const { PUBLIC_INKEEP_AGENTS_API_URL } = useRuntimeConfig();

  return useQuery<MCPTool>({
    queryKey: ['mcp-tool-status', tenantId, projectId, toolId],
    queryFn: async () => {
      const url = `${PUBLIC_INKEEP_AGENTS_API_URL}/manage/tenants/${tenantId}/projects/${projectId}/tools/${toolId}`;

      const response = await fetch(url, {
        method: 'GET',
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.message || `Failed to fetch tool status: ${response.status}`);
      }

      const data = await response.json();
      return data.data as MCPTool;
    },
    enabled,
    staleTime: 30_000,
    meta: {
      defaultError: 'Failed to fetch tool status',
    },
  });
}
