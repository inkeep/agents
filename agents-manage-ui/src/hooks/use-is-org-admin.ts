import { OrgRoles } from '@inkeep/agents-core/client-exports';
import { useEffect, useState } from 'react';
import { useAuthClient } from '@/contexts/auth-client';
import { useRuntimeConfig } from '@/contexts/runtime-config';

/**
 * Hook to check if the current user is an org owner or admin.
 * Useful for permission checks on org-level actions (create/delete projects, etc.)
 */
export function useIsOrgAdmin(): { isAdmin: boolean; isLoading: boolean } {
  const authClient = useAuthClient();
  const { PUBLIC_DISABLE_AUTH } = useRuntimeConfig();
  const isAuthDisabled = PUBLIC_DISABLE_AUTH === 'true';

  const [state, setState] = useState<{ isAdmin: boolean; isLoading: boolean }>({
    isAdmin: false,
    isLoading: true,
  });

  useEffect(() => {
    // When auth is disabled, grant admin access (matches server-side behavior)
    if (isAuthDisabled) {
      setState({ isAdmin: true, isLoading: false });
      return;
    }

    async function checkRole() {
      try {
        const memberResult = await authClient.organization.getActiveMember();
        if (memberResult.data) {
          const role = memberResult.data.role;
          setState({
            isAdmin: role === OrgRoles.OWNER || role === OrgRoles.ADMIN,
            isLoading: false,
          });
        } else {
          setState({ isAdmin: false, isLoading: false });
        }
      } catch {
        setState({ isAdmin: false, isLoading: false });
      }
    }
    checkRole();
  }, [authClient, isAuthDisabled]);

  return state;
}
