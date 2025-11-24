'use client';

import { Loader2 } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { useRuntimeConfig } from '@/contexts/runtime-config-context';
import { getPendingInvitations } from '@/lib/actions/invitations';
import { getUserOrganizations } from '@/lib/actions/user-organizations';
import { useAuthClient } from '@/lib/auth-client';
import { DEFAULT_TENANT_ID } from '@/lib/runtime-config/defaults';

function HomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const authClient = useAuthClient();
  const session = authClient.useSession();

  const user = session.data?.user;
  const isLoading = session.isPending;
  const activeOrganizationId = session.data?.session?.activeOrganizationId;
  
  const [isRedirecting, setIsRedirecting] = useState(false);
  const { PUBLIC_DISABLE_AUTH } = useRuntimeConfig();

  const tenantId = process.env.NEXT_PUBLIC_TENANT_ID || DEFAULT_TENANT_ID;

  useEffect(() => {
    async function handleRedirect() {
      // Prevent multiple redirects
      if (isRedirecting) return;

      // Auth disabled - go straight to default tenant
      if (PUBLIC_DISABLE_AUTH === 'true') {
        setIsRedirecting(true);
        router.push(`/${tenantId}/projects`);
        return;
      }

      // Still loading session
      if (isLoading) return;

      // Check for invitation in URL
      const invitationId = searchParams.get('invitation');
      if (invitationId) {
        setIsRedirecting(true);
        router.push(`/accept-invitation/${invitationId}`);
        return;
      }

      // Not authenticated - redirect to login
      if (!user) {
        setIsRedirecting(true);
        router.push('/login');
        return;
      }

      // Authenticated - find their organization
      try {
        const userOrganizations = await getUserOrganizations(user.id);

        // No organizations - check for pending invitations
        if (!userOrganizations || userOrganizations.length === 0) {
          const pendingInvitations = await getPendingInvitations(user.email);

          if (pendingInvitations.length > 0) {
            setIsRedirecting(true);
            router.push(`/accept-invitation/${pendingInvitations[0].id}`);
            return;
          }

          // No invitations either - show no-org page
          setIsRedirecting(true);
          router.push('/no-organization');
          return;
        }

        // Determine which organization to use
        let organizationId = tenantId;

        if (activeOrganizationId) {
          organizationId = activeOrganizationId;
        } else if (userOrganizations.length > 0) {
          organizationId = userOrganizations[0].organizationId;
        }

        // Redirect to projects page
        setIsRedirecting(true);
        router.push(`/${organizationId}/projects`);
      } catch (error) {
        console.error(error);
        setIsRedirecting(true);
        router.push('/login');
      }
    }

    handleRedirect();
  }, [user, isLoading, activeOrganizationId, isRedirecting, tenantId, searchParams, router, PUBLIC_DISABLE_AUTH]);

  return (
    <div className="flex items-center justify-center h-full">
      <Loader2 className="size-4 animate-spin text-muted-foreground" />
    </div>
  );
}

export default function Home() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-full">
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <HomeContent />
    </Suspense>
  );
}
