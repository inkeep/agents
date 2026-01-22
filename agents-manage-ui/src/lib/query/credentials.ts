'use client';

import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { type Credential, fetchUserScopedCredential } from '@/lib/api/credentials';

const credentialQueryKeys = {
  userScoped: (tenantId: string, projectId: string, toolId: string) =>
    ['user-scoped-credential', tenantId, projectId, toolId] as const,
};

export function useUserScopedCredentialQuery(
  toolId = '',
  options?: { disabled?: boolean }
) {
  'use memo';
  const { tenantId, projectId } = useParams<{ tenantId?: string; projectId?: string }>();

  if (!tenantId || !projectId) {
    throw new Error('tenantId and projectId are required');
  }

  const enabled = Boolean(tenantId && projectId && toolId) && !options?.disabled;

  return useQuery<Credential | null>({
    queryKey: credentialQueryKeys.userScoped(tenantId, projectId, toolId),
    queryFn: () => fetchUserScopedCredential(tenantId, projectId, toolId),
    enabled,
    staleTime: 30_000,
    initialData: null,
    initialDataUpdatedAt: 0,
    meta: {
      defaultError: 'Failed to load credential',
    },
  });
}
