'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthClient } from '@/lib/auth-client';

type FullOrganization = NonNullable<
  Awaited<ReturnType<ReturnType<typeof useAuthClient>['organization']['getFullOrganization']>>['data']
>;

export function SettingsContent() {
  const authClient = useAuthClient();
  const { tenantId } = useParams<{ tenantId: string }>();
  const [organization, setOrganization] = useState<FullOrganization | null>(null);
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
    return (
      <div className="space-y-6">
        <Skeleton className="h-32 w-full rounded-lg" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    );
  }

  if (error || !organization) {
    return (
      <Card className="border bg-background shadow-none rounded-lg">
        <CardContent className="py-8">
          <p className="text-sm text-destructive">{error || 'Failed to load organization'}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="border bg-background shadow-none rounded-lg">
        <CardHeader>
          <CardTitle>Organization Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm font-medium">Name</p>
            <p className="text-sm text-muted-foreground">{organization.name}</p>
          </div>
          <div>
            <p className="text-sm font-medium">ID</p>
            <p className="text-xs text-muted-foreground font-mono">{organization.id}</p>
          </div>
        </CardContent>
      </Card>

      <Card className="border bg-background shadow-none rounded-lg">
        <CardHeader>
          <CardTitle>Members ({organization.members.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {organization.members.map((member: FullOrganization['members'][number]) => (
              <div
                key={member.id}
                className="flex items-center justify-between py-2 border-b last:border-0"
              >
                <div>
                  <p className="text-sm font-medium">
                    {member.user.name || member.user.email}
                  </p>
                  <p className="text-xs text-muted-foreground">{member.user.email}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
