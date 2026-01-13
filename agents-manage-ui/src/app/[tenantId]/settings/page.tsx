'use client';

import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { ErrorContent } from '@/components/errors/full-page-error';
import { MembersTable } from '@/components/settings/members-table';
import { CopyableSingleLineCode } from '@/components/ui/copyable-single-line-code';
import { useAuthClient } from '@/lib/auth-client';
import SettingsLoadingSkeleton from './loading';

type FullOrganization = NonNullable<
  Awaited<
    ReturnType<ReturnType<typeof useAuthClient>['organization']['getFullOrganization']>
  >['data']
>;

type Member = FullOrganization['members'][number];

export default function SettingsPage() {
  const authClient = useAuthClient();
  const { tenantId } = useParams<{ tenantId: string }>();
  const [organization, setOrganization] = useState<FullOrganization | null>();
  const [currentMember, setCurrentMember] = useState<Member | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOrganization = useCallback(async () => {
    if (!tenantId) return;

    try {
      const [orgResult, memberResult] = await Promise.all([
        authClient.organization.getFullOrganization({
          query: {
            organizationId: tenantId,
            membersLimit: 100,
          },
        }),
        authClient.organization.getActiveMember(),
      ]);


      if (orgResult.error) {
        setError(orgResult.error.message || 'Failed to fetch organization');
        return;
      }

      if (orgResult.data) {
        setOrganization(orgResult.data);
      }

      if (memberResult.data) {
        setCurrentMember(memberResult.data as Member);
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
        currentMember={currentMember}
        organizationId={tenantId}
        onMemberUpdated={fetchOrganization}
      />
    </div>
  );
}
