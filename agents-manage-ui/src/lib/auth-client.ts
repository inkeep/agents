import { ssoClient } from '@better-auth/sso/client';
import { ac, adminRole, memberRole, ownerRole } from '@inkeep/agents-core/auth/permissions';
import { deviceAuthorizationClient, organizationClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';
import { useMemo } from 'react';
import { useRuntimeConfig } from '@/contexts/runtime-config-context';

export function useAuthClient() {
  const { PUBLIC_INKEEP_AGENTS_MANAGE_API_URL } = useRuntimeConfig();

  return useMemo(
    () =>
      createAuthClient({
        baseURL: PUBLIC_INKEEP_AGENTS_MANAGE_API_URL,
        fetchOptions: {
          credentials: 'include',
        },
        plugins: [
          ssoClient(),
          organizationClient({
            ac,
            roles: {
              member: memberRole,
              admin: adminRole,
              owner: ownerRole,
            },
          }),
          deviceAuthorizationClient(),
        ],
      }),
    [PUBLIC_INKEEP_AGENTS_MANAGE_API_URL]
  );
}
