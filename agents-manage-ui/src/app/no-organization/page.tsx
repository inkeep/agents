'use client';

import { AlertTriangle, Loader2, Mail, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
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
  const [inviteError, setInviteError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  async function checkInvitations() {
    if (!user?.email) {
      setLoadingInvites(false);
      return;
    }

    const requestId = ++requestIdRef.current;
    setLoadingInvites(true);
    setInviteError(null);

    const result = await getPendingInvitations(user.email);
    if (requestId !== requestIdRef.current) return;

    if (result.success) {
      setPendingInvites(
        result.invitations.map((inv) => ({
          id: inv.id,
          organizationName: inv.organizationName,
          role: inv.role,
        }))
      );
    } else {
      setInviteError(result.error);
      setPendingInvites([]);
    }
    setLoadingInvites(false);
  }

  useEffect(() => {
    checkInvitations();
  }, [checkInvitations]);

  if (loadingInvites) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (inviteError) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 py-12">
        <Card className="w-full max-w-md shadow-none border-none bg-transparent space-y-3">
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-6 w-6 text-destructive" />
              <CardTitle className="text-2xl font-medium tracking-tight text-foreground">
                Unable to load invitations
              </CardTitle>
            </div>
            <CardDescription>
              We couldn&apos;t check for pending invitations for{' '}
              <span className="font-medium">{user?.email}</span>. You may have invitations waiting.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button onClick={checkInvitations} disabled={loadingInvites} className="w-full">
              {loadingInvites ? 'Checking...' : 'Try Again'}
            </Button>
            <Button onClick={handleSignOut} variant="outline" className="w-full">
              Sign Out
            </Button>
          </CardContent>
        </Card>
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
