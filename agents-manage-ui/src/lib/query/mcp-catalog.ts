'use client';

import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { fetchThirdPartyMCPServer } from '@/lib/api/mcp-catalog';

const mcpCatalogQueryKeys = {
  thirdPartyServer: (
    tenantId: string,
    projectId: string,
    url: string,
    credentialScope: 'project' | 'user'
  ) => ['third-party-mcp-server', tenantId, projectId, url, credentialScope] as const,
};

type ThirdPartyMCPServerResponse = Awaited<ReturnType<typeof fetchThirdPartyMCPServer>>;

export function useThirdPartyMCPServerQuery({
  url = '',
  credentialScope = 'project',
  enabled = true,
}: {
  url?: string;
  credentialScope?: 'project' | 'user';
  enabled?: boolean;
} = {}) {
  'use memo';
  const { tenantId, projectId } = useParams<{ tenantId?: string; projectId?: string }>();

  if (!tenantId || !projectId) {
    throw new Error('tenantId and projectId are required');
  }

  return useQuery<ThirdPartyMCPServerResponse['data']>({
    queryKey: mcpCatalogQueryKeys.thirdPartyServer(tenantId, projectId, url, credentialScope),
    async queryFn() {
      const response = await fetchThirdPartyMCPServer(tenantId, projectId, url, credentialScope);
      return response.data;
    },
    enabled: enabled && Boolean(url),
    staleTime: 30_000,
    initialData: null,
    // force `queryFn` still runs on mount
    initialDataUpdatedAt: 0,
    meta: {
      defaultError: 'Failed to load third-party MCP server details',
    },
  });
}
