'use client';

import {
  DEFAULT_MEMBERSHIP_LIMIT,
  QUOTA_RESOURCE_TYPES,
  SEAT_RESOURCE_TYPES,
} from '@inkeep/agents-core/client-exports';
import { use, useEffect, useState } from 'react';
import { ErrorContent } from '@/components/errors/full-page-error';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { useAuthClient } from '@/contexts/auth-client';
import { useIsOrgAdmin } from '@/hooks/use-is-org-admin';
import { fetchEntitlements, type OrgEntitlement } from '@/lib/api/entitlements';
import { useProjectsQuery } from '@/lib/query/projects';
import BillingLoadingSkeleton from './loading';

interface UsageItem {
  label: string;
  used: number;
  max: number;
}

function UsageRow({ label, used, max }: UsageItem) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground">
          {used} / {max}
        </span>
      </div>
      <Progress value={used} max={max} />
    </div>
  );
}

export default function BillingPage({ params }: PageProps<'/[tenantId]/billing'>) {
  const authClient = useAuthClient();
  const { tenantId } = use(params);
  const { isAdmin: isOrgAdmin, isLoading: isAdminLoading } = useIsOrgAdmin();
  const [entitlements, setEntitlements] = useState<OrgEntitlement[]>([]);
  const [seatCounts, setSeatCounts] = useState<{ admin: number; member: number }>({
    admin: 0,
    member: 0,
  });
  const { data: projects, isFetching: isProjectsFetching } = useProjectsQuery({ tenantId });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function fetchData() {
    if (!tenantId) return;

    try {
      const [entitlementsResult, orgResult] = await Promise.all([
        fetchEntitlements(tenantId).catch(() => [] as OrgEntitlement[]),
        authClient.organization.getFullOrganization({
          query: { organizationId: tenantId, membersLimit: DEFAULT_MEMBERSHIP_LIMIT },
        }),
      ]);

      setEntitlements(entitlementsResult);

      if (orgResult.data?.members) {
        const serviceAccountUserId = orgResult.data.serviceAccountUserId;
        const members = orgResult.data.members.filter((m) => m.user.id !== serviceAccountUserId);
        const adminCount = members.filter((m) => m.role === 'admin' || m.role === 'owner').length;
        const memberCount = members.filter((m) => m.role === 'member').length;
        setSeatCounts({ admin: adminCount, member: memberCount });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load usage data');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (isAdminLoading || loading || isProjectsFetching) {
    return <BillingLoadingSkeleton />;
  }

  if (!isOrgAdmin) {
    return <ErrorContent errorCode="forbidden" context="billing" />;
  }

  if (error) {
    return <ErrorContent error={new Error(error)} context="billing" />;
  }

  const adminEntitlement = entitlements.find((e) => e.resourceType === SEAT_RESOURCE_TYPES.ADMIN);
  const memberEntitlement = entitlements.find((e) => e.resourceType === SEAT_RESOURCE_TYPES.MEMBER);
  const projectEntitlement = entitlements.find(
    (e) => e.resourceType === QUOTA_RESOURCE_TYPES.PROJECT
  );

  const hasAnyEntitlements = entitlements.length > 0;

  if (!hasAnyEntitlements) {
    return (
      <Card className="shadow-none">
        <CardHeader>
          <CardTitle className="text-base font-medium">Billing</CardTitle>
          <CardDescription>No entitlements configured for this organization.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {(adminEntitlement || memberEntitlement) && (
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle className="text-base font-medium">Seats</CardTitle>
            <CardDescription>Organization member seat allocation</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {adminEntitlement && (
              <UsageRow
                label="Admin seats"
                used={seatCounts.admin}
                max={adminEntitlement.maxValue}
              />
            )}
            {memberEntitlement && (
              <UsageRow
                label="Member seats"
                used={seatCounts.member}
                max={memberEntitlement.maxValue}
              />
            )}
          </CardContent>
        </Card>
      )}

      {projectEntitlement && (
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle className="text-base font-medium">Resources</CardTitle>
            <CardDescription>Organization resource limits</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <UsageRow label="Projects" used={projects.length} max={projectEntitlement.maxValue} />
          </CardContent>
        </Card>
      )}

      <Card className="shadow-none">
        <CardHeader>
          <CardTitle className="text-base font-medium">Need more?</CardTitle>
          <CardDescription>
            Contact your organization admin to request limit increases.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
