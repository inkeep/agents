'use client';

import {
  DEFAULT_MEMBERSHIP_LIMIT,
  OrgRoles,
  type ProjectRole,
} from '@inkeep/agents-core/client-exports';
import { useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { useAuthClient } from '@/contexts/auth-client';
import {
  addProjectMember,
  listProjectMembers,
  removeProjectMember,
  updateProjectMember,
} from '@/lib/api/project-members';
import type {
  AccessPrincipal,
  InheritedAccessConfig,
  PrincipalType,
  ProjectMemberFromApi,
} from '../types';

interface UseProjectAccessParams {
  tenantId: string;
  projectId: string;
}

export interface UseProjectAccessResult {
  // Data
  principals: AccessPrincipal[];
  availablePrincipals: AccessPrincipal[];
  inheritedAccess: InheritedAccessConfig | undefined;

  // Loading states
  isLoading: boolean;
  isMutating: boolean;

  // Error
  error: string | null;

  // Mutations
  addPrincipal: (principalId: string, principalType: PrincipalType, role: string) => void;
  removePrincipal: (principalId: string, principalType: PrincipalType, role: string) => void;
  changeRole: (
    principalId: string,
    principalType: PrincipalType,
    oldRole: string,
    newRole: string
  ) => void;

  // Refetch
  refetch: () => Promise<void>;
}

/**
 * Convert org member data to AccessPrincipal format
 */
function toAccessPrincipal(member: {
  userId: string;
  name: string;
  email: string;
  role: string;
}): AccessPrincipal {
  return {
    id: member.userId,
    type: 'user',
    displayName: member.name || member.email,
    subtitle: member.email,
    role: member.role,
  };
}

/**
 * Hook for managing project access.
 * Handles all project-specific API calls and data transformations.
 */
export function useProjectAccess({
  tenantId,
  projectId,
}: UseProjectAccessParams): UseProjectAccessResult {
  const authClient = useAuthClient();

  // State for project members (from SpiceDB via API)
  const [rawMembers, setRawMembers] = useState<ProjectMemberFromApi[]>([]);
  const [isLoadingMembers, setIsLoadingMembers] = useState(true);
  const [membersError, setMembersError] = useState<string | null>(null);

  // State for org members (for enrichment and available principals list)
  const [orgMembers, setOrgMembers] = useState<AccessPrincipal[]>([]);
  const [isLoadingOrg, setIsLoadingOrg] = useState(true);

  // Mutation state
  const [isMutating, startMutating] = useTransition();

  // Fetch project members from API
  async function fetchProjectMembers() {
    try {
      setIsLoadingMembers(true);
      setMembersError(null);

      const response = await listProjectMembers({ tenantId, projectId });
      setRawMembers(response.data || []);
    } catch (err) {
      setMembersError(err instanceof Error ? err.message : 'Failed to load members');
    }
    setIsLoadingMembers(false);
  }

  // Initial data fetch
  useEffect(() => {
    // Fetch org members for enrichment and available principals list
    async function fetchOrgMembers() {
      try {
        const { data } = await authClient.organization.getFullOrganization({
          query: { organizationId: tenantId, membersLimit: DEFAULT_MEMBERSHIP_LIMIT },
        });

        if (data?.members) {
          const principals: AccessPrincipal[] = data.members.map((m) =>
            toAccessPrincipal({
              userId: m.user.id,
              name: m.user.name || '',
              email: m.user.email,
              role: m.role,
            })
          );
          setOrgMembers(principals);
        }
      } catch {
        // Silent fail - org members are for enrichment
      }
      setIsLoadingOrg(false);
    }
    fetchProjectMembers();
    fetchOrgMembers();
  }, [
    tenantId,
    authClient,
    // biome-ignore lint/correctness/useExhaustiveDependencies: false positive, variable is stable and optimized by the React Compiler
    fetchProjectMembers,
  ]);

  // Enrich raw members with org member data and convert to AccessPrincipal
  const enrichedPrincipals: AccessPrincipal[] = rawMembers.map((member) => {
    const orgMember = orgMembers.find((om) => om.id === member.userId);

    return {
      id: member.userId,
      type: 'user' as PrincipalType,
      displayName: orgMember?.displayName || member.userId,
      subtitle: orgMember?.subtitle || '',
      role: member.role,
    };
  });

  // Build inherited access config (org admins)
  const inheritedAccess: InheritedAccessConfig | undefined =
    orgMembers.length > 0
      ? {
          title: 'Organization Access',
          description: 'Inherited from organization — admins have full project access.',
          principals: orgMembers.filter(
            (m) => m.role === OrgRoles.OWNER || m.role === OrgRoles.ADMIN
          ),
        }
      : undefined;

  // Filter out org admins from available principals (they have implicit access)
  // In the future, this could also include groups, service accounts, etc.
  const availablePrincipals = orgMembers.filter(
    (m) => m.role !== OrgRoles.OWNER && m.role !== OrgRoles.ADMIN
  );

  // Mutations
  const addPrincipal: UseProjectAccessResult['addPrincipal'] = (
    principalId,
    principalType,
    role
  ) => {
    if (principalType !== 'user') {
      throw new Error(`Adding ${principalType} to projects is not yet supported`);
    }
    startMutating(async () => {
      try {
        await addProjectMember({
          tenantId,
          projectId,
          userId: principalId,
          role: role as ProjectRole,
        });
        toast.success('Member added successfully');
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to add member');
        throw err;
      }
    });
  };

  const removePrincipal: UseProjectAccessResult['removePrincipal'] = (
    principalId,
    principalType,
    role
  ) => {
    if (principalType !== 'user') {
      throw new Error(`Removing ${principalType} from projects is not yet supported`);
    }

    // Optimistically update local state
    const previousMembers = [...rawMembers];
    setRawMembers((prev) => prev.filter((m) => m.userId !== principalId));

    startMutating(async () => {
      try {
        await removeProjectMember({
          tenantId,
          projectId,
          userId: principalId,
          role: role as ProjectRole,
        });
        toast.success('Member removed successfully');
      } catch (err) {
        // Revert optimistic update on error
        setRawMembers(previousMembers);
        toast.error(err instanceof Error ? err.message : 'Failed to remove member');
        throw err;
      }
    });
  };

  const changeRole: UseProjectAccessResult['changeRole'] = (
    principalId,
    principalType,
    oldRole,
    newRole
  ) => {
    if (oldRole === newRole) return;

    if (principalType !== 'user') {
      throw new Error(`Changing role for ${principalType} on projects is not yet supported`);
    }

    // Optimistically update local state
    const previousMembers = [...rawMembers];
    setRawMembers((prev) =>
      prev.map((m) => (m.userId === principalId ? { ...m, role: newRole as ProjectRole } : m))
    );

    startMutating(async () => {
      try {
        await updateProjectMember({
          tenantId,
          projectId,
          userId: principalId,
          role: newRole as ProjectRole,
          previousRole: oldRole as ProjectRole,
        });
        toast.success('Role updated successfully');
      } catch (err) {
        // Revert optimistic update on error
        setRawMembers(previousMembers);
        toast.error(err instanceof Error ? err.message : 'Failed to update role');
        throw err;
      }
    });
  };

  return {
    principals: enrichedPrincipals,
    availablePrincipals,
    inheritedAccess,
    isLoading: isLoadingMembers || isLoadingOrg,
    isMutating,
    error: membersError,
    addPrincipal,
    removePrincipal,
    changeRole,
    refetch: fetchProjectMembers,
  };
}
