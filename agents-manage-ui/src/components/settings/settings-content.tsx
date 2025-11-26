'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuthClient } from '@/lib/auth-client';
import { ErrorContent } from '../errors/full-page-error';
import { CopyableSingleLineCode } from '../ui/copyable-single-line-code';
import { SettingsLoadingSkeleton } from './loading';
import { MembersTable } from './members-table';

type FullOrganization = NonNullable<
  Awaited<
    ReturnType<ReturnType<typeof useAuthClient>['organization']['getFullOrganization']>
  >['data']
>;

export function SettingsContent() {
  const authClient = useAuthClient();
  const { tenantId } = useParams<{ tenantId: string }>();
  const [organization, setOrganization] = useState<FullOrganization | null>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchOrganization() {
      if (!tenantId) return;

      try {
        const { data, error } = await authClient.organization.getFullOrganization({
          query: {
            organizationId: tenantId,
            membersLimit: 100,
          },
        });

        if (error) {
          setError(error.message || 'Failed to fetch organization');
          return;
        }

        if (data) {
          setOrganization(data);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch organization');
      } finally {
        setLoading(false);
      }
    }

    fetchOrganization();
  }, [tenantId, authClient]);

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
      <div className=" flex items-center gap-6 rounded-lg border p-4">
        <div className="flex flex-col gap-2 flex-1">
          <p className="text-sm font-medium">Organization name</p>
          <CopyableSingleLineCode code={organization.name} />
        </div>
        <div className="flex flex-col gap-2 flex-1">
          <p className="text-sm font-medium">Organization id</p>
          <CopyableSingleLineCode code={organization.id} />
        </div>
      </div>
      <MembersTable members={organization?.members || []} />
    </div>
  );
}
