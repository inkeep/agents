'use client';

import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { type Credential, fetchUserScopedCredential } from '@/lib/api/credentials';

const credentialQueryKeys = {
  userScoped: (tenantId: string, projectId: string, toolId: string) =>
    ['user-scoped-credential', tenantId, projectId, toolId] as const,
};

export function useUserScopedCredentialQuery({
  toolId = '',
  enabled = true,
}: {
  toolId?: string;
  enabled?: boolean;
} = {}) {
  'use memo';
  const { tenantId, projectId } = useParams<{ tenantId?: string; projectId?: string }>();

  if (!tenantId || !projectId) {
    throw new Error('tenantId and projectId are required');
  }

  return useQuery<Credential | null>({
    queryKey: credentialQueryKeys.userScoped(tenantId, projectId, toolId),
    queryFn: () => fetchUserScopedCredential(tenantId, projectId, toolId),
    enabled: enabled && Boolean(toolId),
    staleTime: 30_000,
    initialData: null,
    // force `queryFn` still runs on mount
    initialDataUpdatedAt: 0,
    meta: {
      defaultError: 'Failed to load user credential',
    },
  });
}
