'use client';

import { use, useCallback, useEffect, useState } from 'react';
import { ErrorContent } from '@/components/errors/full-page-error';
import { MembersTable } from '@/components/settings/members-table';
import { CopyableSingleLineCode } from '@/components/ui/copyable-single-line-code';
import { OrgRoles } from '@/constants/signoz';
import { useAuthClient } from '@/contexts/auth-client';
import { useRequireAuth } from '@/hooks/use-require-auth';
import { getUserProviders, type UserProvider } from '@/lib/actions/user-accounts';
import SettingsLoadingSkeleton from './loading';

type FullOrganization = NonNullable<
  Awaited<
    ReturnType<ReturnType<typeof useAuthClient>['organization']['getFullOrganization']>
  >['data']
>;

export default function SettingsPage({ params }: PageProps<'/[tenantId]/settings'>) {
  useRequireAuth();
  const authClient = useAuthClient();
  const { tenantId } = use(params);
  const [organization, setOrganization] = useState<FullOrganization | null>();
  const [currentMember, setCurrentMember] = useState<typeof authClient.$Infer.Member | null>(null);
  const [pendingInvitations, setPendingInvitations] = useState<
    (typeof authClient.$Infer.Invitation)[]
  >([]);
  const [memberProviders, setMemberProviders] = useState<UserProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOrganization = useCallback(async () => {
    if (!tenantId) return;

    try {
      const [orgResult, memberResult, invitationsResult] = await Promise.all([
        authClient.organization.getFullOrganization({
          query: {
            organizationId: tenantId,
            membersLimit: 100,
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

        // Fetch providers for all members
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
    fetchOrganization();
  }, [fetchOrganization]);

  if (loading) {
    return <SettingsLoadingSkeleton />;
  }

  if (error || !organization) {
    return (
      <ErrorContent
        error={new Error(error || 'Failed to load organization')}
        context="organization"
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-6 rounded-lg border p-4">
        <div className="flex flex-col gap-2 flex-1">
          <p className="text-sm font-medium">Organization name</p>
          <CopyableSingleLineCode code={organization.name} />
        </div>
        <div className="flex flex-col gap-2 flex-1">
          <p className="text-sm font-medium">Organization id</p>
          <CopyableSingleLineCode code={organization.id} />
        </div>
      </div>
      <MembersTable
        members={organization?.members || []}
        pendingInvitations={pendingInvitations}
        currentMember={currentMember}
        organizationId={tenantId}
        onMemberUpdated={fetchOrganization}
        isOrgAdmin={
          currentMember?.role === OrgRoles.OWNER || currentMember?.role === OrgRoles.ADMIN
        }
        memberProviders={memberProviders}
      />
    </div>
  );
}
