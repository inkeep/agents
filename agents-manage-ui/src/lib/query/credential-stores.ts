'use client';

import { useQuery } from '@tanstack/react-query';
import { type CredentialStoreStatus, listCredentialStores } from '@/lib/api/credentialStores';

export function useCredentialStoresQuery(tenantId: string, projectId: string) {
  'use memo';
  return useQuery<CredentialStoreStatus[]>({
    queryKey: ['credential-stores', tenantId, projectId],
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
