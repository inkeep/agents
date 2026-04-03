'use client';

import { ssoClient } from '@better-auth/sso/client';
import {
  ac,
  adminRole,
  memberRole,
  organizationClient,
  ownerRole,
} from '@inkeep/agents-core/auth/permissions';
import {
  deviceAuthorizationClient,
  inferOrgAdditionalFields,
  lastLoginMethodClient,
} from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';
import { createContext, type ReactNode, use } from 'react';
import { useRuntimeConfig } from '@/contexts/runtime-config';

// Create a factory function to get the proper inferred type
const createConfiguredAuthClient = (baseURL: string) =>
  createAuthClient({
    baseURL,
    fetchOptions: {
      credentials: 'include',
    },
    plugins: [
      ssoClient(),
      lastLoginMethodClient(),
      organizationClient({
        ac,
        roles: {
          member: memberRole,
          admin: adminRole,
          owner: ownerRole,
        },
        schema: inferOrgAdditionalFields({
          organization: {
            additionalFields: {
              preferredAuthMethod: {
                type: 'string',
              },
              allowedAuthMethods: {
                type: 'string',
              },
              serviceAccountUserId: {
                type: 'string',
              },
            },
          },
        }),
      }),
      deviceAuthorizationClient(),
    ],
  });

// Infer the full client type including all plugin methods
type AuthClientType = ReturnType<typeof createConfiguredAuthClient>;

const AuthClientContext = createContext<AuthClientType | null>(null);

export function AuthClientProvider({ children }: { children: ReactNode }) {
  const { PUBLIC_INKEEP_AGENTS_API_URL } = useRuntimeConfig();

  const authClient = createConfiguredAuthClient(PUBLIC_INKEEP_AGENTS_API_URL);

  return <AuthClientContext value={authClient}>{children}</AuthClientContext>;
}

export function useAuthClient() {
  const client = use(AuthClientContext);
  if (!client) {
    throw new Error('useAuthClient must be used within a <AuthClientProvider />');
  }
  return client;
}
