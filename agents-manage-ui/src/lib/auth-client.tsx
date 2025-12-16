'use client';

import { ssoClient } from '@better-auth/sso/client';
import { ac, adminRole, memberRole, ownerRole } from '@inkeep/agents-core/auth/permissions';
import { deviceAuthorizationClient, organizationClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';
import { createContext, type ReactNode, useContext, useMemo } from 'react';
import { useRuntimeConfig } from '@/contexts/runtime-config-context';

type AuthClient = ReturnType<typeof createAuthClient>;

const AuthClientContext = createContext<AuthClient | null>(null);

export function AuthClientProvider({ children }: { children: ReactNode }) {
  const { PUBLIC_INKEEP_AGENTS_MANAGE_API_URL } = useRuntimeConfig();

  const authClient = useMemo(
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

  return <AuthClientContext.Provider value={authClient}>{children}</AuthClientContext.Provider>;
}

export function useAuthClient() {
  const client = useContext(AuthClientContext);
  if (!client) {
    throw new Error('useAuthClient must be used within <AuthClientProvider>');
  }
  return client;
}
