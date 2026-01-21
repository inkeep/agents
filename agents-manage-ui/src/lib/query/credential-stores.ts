'use client';

import { useQuery } from '@tanstack/react-query';
import { type CredentialStoreStatus, listCredentialStores } from '@/lib/api/credentialStores';

const credentialStoresQueryKeys = {
  list: (tenantId: string, projectId: string) =>
    ['credential-stores', tenantId, projectId] as const,
};

export function useCredentialStoresQuery(tenantId: string, projectId: string) {
  return useQuery<CredentialStoreStatus[]>({
    queryKey: credentialStoresQueryKeys.list(tenantId, projectId),
    queryFn: () => listCredentialStores(tenantId, projectId),
    enabled: Boolean(tenantId && projectId),
    staleTime: 30_000,
    initialData: [],
    // force `queryFn` still runs on mount
    initialDataUpdatedAt: 0,
    meta: {
      defaultError: 'Failed to load credential stores',
    },
  });
}
