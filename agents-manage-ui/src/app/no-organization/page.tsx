'use client';

import { Loader2, Mail, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ErrorContent } from '@/components/errors/full-page-error';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { STATIC_LABELS } from '@/constants/theme';
import { useAuthSession } from '@/hooks/use-auth';
import { useSignOut } from '@/hooks/use-sign-out';
import { getPendingInvitations } from '@/lib/actions/invitations';

interface PendingInvite {
  id: string;
  organizationName: string | null;
  role: string | null;
}

export default function NoOrganizationPage() {
  const { user } = useAuthSession();
  const handleSignOut = useSignOut();
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [loadingInvites, setLoadingInvites] = useState(true);

  useEffect(() => {
    async function checkInvitations() {
      if (!user?.email) {
        setLoadingInvites(false);
        return;
      }

      try {
        const invitations = await getPendingInvitations(user.email);
        setPendingInvites(
          invitations.map((inv) => ({
            id: inv.id,
            organizationName: inv.organizationName,
            role: inv.role,
          }))
        );
      } catch {
        // Silently fail -- still show the no-org page
      } finally {
        setLoadingInvites(false);
      }
    }

    checkInvitations();
  }, [user?.email]);

  if (loadingInvites) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (pendingInvites.length > 0) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 py-12">
        <Card className="w-full max-w-md shadow-none border-none bg-transparent space-y-3">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Mail className="h-6 w-6 text-primary" />
              <CardTitle className="text-2xl font-medium tracking-tight text-foreground">
                {pendingInvites.length === 1
                  ? 'You have an invitation'
                  : `You have ${pendingInvites.length} invitations`}
              </CardTitle>
            </div>
            <CardDescription>
              Signed in as <span className="font-medium">{user?.email}</span>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {pendingInvites.map((invite) => (
              <Link
                key={invite.id}
                href={`/accept-invitation/${invite.id}?email=${encodeURIComponent(user?.email ?? '')}`}
                className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted text-sm font-medium">
                  {(invite.organizationName ?? 'O').charAt(0).toUpperCase()}
                </div>
                <div className="space-y-0.5 flex-1">
                  <p className="text-sm font-medium">{invite.organizationName ?? 'Organization'}</p>
                  {invite.role && (
                    <p className="text-xs text-muted-foreground capitalize">
                      Invited as {invite.role}
                    </p>
                  )}
                </div>
              </Link>
            ))}

            <Button onClick={handleSignOut} variant="outline" className="w-full mt-4">
              Sign Out
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <ErrorContent
        title={STATIC_LABELS['no-organization-found']}
        icon={XCircle}
        showRetry={false}
        description={
          <div className="flex flex-col space-y-5">
            <p>
              Your account {user?.email ? <span className="font-semibold">{user?.email}</span> : ''}{' '}
              is not associated with any organization. Please contact your organization
              administrator to request access.
            </p>
            <Button onClick={handleSignOut} variant="outline" className="w-full">
              Sign Out
            </Button>
          </div>
        }
      />
    </div>
  );
}
