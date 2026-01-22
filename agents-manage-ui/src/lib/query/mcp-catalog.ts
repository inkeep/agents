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
  disabled,
}: {
  url?: string;
  credentialScope?: 'project' | 'user';
  disabled?: boolean;
} = {}) {
  'use memo';
  const { tenantId, projectId } = useParams<{ tenantId?: string; projectId?: string }>();

  if (!tenantId || !projectId) {
    throw new Error('tenantId and projectId are required');
  }

  const enabled = Boolean(tenantId && projectId && url) && !disabled;

  return useQuery<ThirdPartyMCPServerResponse | null>({
    queryKey: mcpCatalogQueryKeys.thirdPartyServer(tenantId, projectId, url, credentialScope),
    queryFn: () => fetchThirdPartyMCPServer(tenantId, projectId, url, credentialScope),
    enabled,
    staleTime: 30_000,
    initialData: null,
    // force `queryFn` still runs on mount
    initialDataUpdatedAt: 0,
    meta: {
      defaultError: 'Failed to load MCP server details',
    },
  });
}
