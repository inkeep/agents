'use client';

import type { PrebuiltMCPServerSchema } from '@inkeep/agents-core';
import { useEffect, useState } from 'react';
import type z from 'zod';
import { fetchMCPCatalogAction } from '../actions/mcp-catalog';

export type PrebuiltMCPServer = z.infer<typeof PrebuiltMCPServerSchema>;

export interface UsePrebuiltMCPServersResult {
  servers: PrebuiltMCPServer[];
  isLoading: boolean;
}

/**
 * Client-side hook to fetch prebuilt MCP servers from the agents-manage-api
 */
export function usePrebuiltMCPServers(
  tenantId: string,
  projectId: string
): UsePrebuiltMCPServersResult {
  const [servers, setServers] = useState<PrebuiltMCPServer[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchServers = async () => {
      setIsLoading(true);
      try {
        const result = await fetchMCPCatalogAction(tenantId, projectId);

        if (result.success && result.data) {
          setServers(result.data);
        } else {
          setServers([]);
        }
      } catch {
        console.error('Failed to fetch MCP catalog');
        setServers([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchServers();
  }, [tenantId, projectId]);

  return { servers, isLoading };
}
