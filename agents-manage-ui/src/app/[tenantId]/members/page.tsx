'use client';

import { use, useCallback, useEffect, useState } from 'react';
import { ErrorContent } from '@/components/errors/full-page-error';
import { MembersTable } from '@/components/members/members-table';
import { OrgRoles } from '@/constants/signoz';
import { useAuthClient } from '@/contexts/auth-client';
import { getUserProviders, type UserProvider } from '@/lib/actions/user-accounts';
import MembersLoadingSkeleton from './loading';

export default function MembersPage({ params }: PageProps<'/[tenantId]/members'>) {
  const authClient = useAuthClient();
  const { tenantId } = use(params);
  const [organization, setOrganization] = useState<
    typeof authClient.$Infer.ActiveOrganization | null
  >();
  const [currentMember, setCurrentMember] = useState<typeof authClient.$Infer.Member | null>(null);
  const [pendingInvitations, setPendingInvitations] = useState<
    (typeof authClient.$Infer.Invitation)[]
  >([]);
  const [memberProviders, setMemberProviders] = useState<UserProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!tenantId) return;

    try {
      const [orgResult, memberResult, invitationsResult] = await Promise.all([
        authClient.organization.getFullOrganization({
          query: {
            organizationId: tenantId,
            membersLimit: 300,
          },
        }),
        authClient.organization.getActiveMember(),
        authClient.organization.listInvitations({
          query: { organizationId: tenantId },
        }),
      ]);

      if (orgResult.error) {
        setError(orgResult.error.message || 'Failed to fetch organization');
        return;
      }

      if (orgResult.data) {
        setOrganization(orgResult.data);

        const userIds = orgResult.data.members?.map((m) => m.user.id) || [];
        if (userIds.length > 0) {
          const providers = await getUserProviders(userIds, tenantId);
          setMemberProviders(providers);
        }
      }

      if (memberResult.data) {
        setCurrentMember(memberResult.data);
      }

      if (invitationsResult.data) {
        const pending = invitationsResult.data.filter((inv) => inv.status === 'pending');
        setPendingInvitations(pending);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch organization');
    } finally {
      setLoading(false);
    }
  }, [tenantId, authClient]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return <MembersLoadingSkeleton />;
  }

  if (error || !organization) {
    return (
      <ErrorContent
        error={new Error(error || 'Failed to load organization')}
        context="organization"
      />
    );
  }

  const isOrgAdmin =
    currentMember?.role === OrgRoles.OWNER || currentMember?.role === OrgRoles.ADMIN;

  return (
    <MembersTable
      members={organization?.members || []}
      pendingInvitations={pendingInvitations}
      currentMember={currentMember}
      organizationId={tenantId}
      onMemberUpdated={fetchData}
      isOrgAdmin={isOrgAdmin}
      memberProviders={memberProviders}
    />
  );
}
