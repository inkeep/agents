'use client';

import { ssoClient } from '@better-auth/sso/client';
import { ac, adminRole, memberRole, ownerRole } from '@inkeep/agents-core/auth/permissions';
import { deviceAuthorizationClient, organizationClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';
import { createContext, type ReactNode, useContext, useMemo } from 'react';
import { useRuntimeConfig } from '@/contexts/runtime-config-context';

// Create a factory function to get the proper inferred type
const createConfiguredAuthClient = (baseURL: string) =>
  createAuthClient({
    baseURL,
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
  });

// Infer the full client type including all plugin methods
type AuthClientType = ReturnType<typeof createConfiguredAuthClient>;

const AuthClientContext = createContext<AuthClientType | null>(null);

export function AuthClientProvider({ children }: { children: ReactNode }) {
  const { PUBLIC_INKEEP_AGENTS_MANAGE_API_URL } = useRuntimeConfig();

  const authClient = useMemo(
    () => createConfiguredAuthClient(PUBLIC_INKEEP_AGENTS_MANAGE_API_URL),
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
