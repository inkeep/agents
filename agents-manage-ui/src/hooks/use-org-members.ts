'use client';

import { OrgRoles } from '@inkeep/agents-core/client-exports';
import { useCallback, useEffect, useState } from 'react';
import { useAuthClient } from '@/contexts/auth-client';
import { listProjectMembers } from '@/lib/api/project-members';

export interface OrgMember {
  id: string;
  name: string;
  email: string;
}

/**
 * Fetch org members, optionally filtered to only those with access to a specific project.
 * Project access = explicit project membership OR org admin/owner (implicit access).
 */
export function useOrgMembers(tenantId: string, projectId?: string) {
  const authClient = useAuthClient();
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchMembers = useCallback(async () => {
    try {
      const { data } = await authClient.organization.getFullOrganization({
        query: { organizationId: tenantId, membersLimit: 100 },
      });
      if (!data?.members) return;

      const allMembers: OrgMember[] = data.members.map((m) => ({
        id: m.user.id,
        name: m.user.name || '',
        email: m.user.email,
      }));

      if (!projectId) {
        setMembers(allMembers);
        return;
      }

      // Build set of user IDs with project access
      const orgAdminIds = new Set(
        data.members
          .filter((m) => m.role === OrgRoles.OWNER || m.role === OrgRoles.ADMIN)
          .map((m) => m.user.id)
      );

      const projectMembersResponse = await listProjectMembers({ tenantId, projectId });
      const projectMemberIds = new Set((projectMembersResponse.data || []).map((m) => m.userId));

      setMembers(allMembers.filter((m) => orgAdminIds.has(m.id) || projectMemberIds.has(m.id)));
    } catch (err) {
      console.error('useOrgMembers: failed to fetch members', err);
    } finally {
      setIsLoading(false);
    }
  }, [authClient, tenantId, projectId]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  return { members, isLoading };
}
