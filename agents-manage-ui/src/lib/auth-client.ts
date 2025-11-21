import { ssoClient } from '@better-auth/sso/client';
import { ac, adminRole, memberRole, ownerRole } from '@inkeep/agents-core/auth/permissions';
import { organizationClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';
import { getManageApiUrl } from './api/api-config';

export const authClient = createAuthClient({
  baseURL: getManageApiUrl(),
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
  ],
});

export type AuthClient = typeof authClient;
