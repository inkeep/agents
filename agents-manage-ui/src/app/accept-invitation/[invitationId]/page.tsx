'use client';

import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuthSession } from '@/hooks/use-auth';
import { authClient } from '@/lib/auth-client';

export default function AcceptInvitationPage() {
  const params = useParams();
  const router = useRouter();
  const { user, isLoading: isAuthLoading } = useAuthSession();
  const invitationId = params.invitationId as string;

  const [invitation, setInvitation] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAccepting, setIsAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Fetch invitation details (only when authenticated)
  useEffect(() => {
    async function fetchInvitation() {
      if (!invitationId) return;
      
      // If not authenticated, don't fetch yet - wait for user to sign in
      if (!user) {
        setIsLoading(false);
        return;
      }

      try {
        const result = await authClient.organization.getInvitation({
          query: { id: invitationId },
        });

        if ('error' in result && result.error) {
          setError(result.error.message || 'Invitation not found');
          setIsLoading(false);
          return;
        }

        if ('data' in result && result.data) {
          setInvitation(result.data);
        }
      } catch {
        setError('Failed to load invitation');
      } finally {
        setIsLoading(false);
      }
    }

    fetchInvitation();
  }, [invitationId, user]);

  const handleAccept = async () => {
    if (!user) {
      // Redirect to login with invitation param
      router.push(`/login?invitation=${invitationId}`);
      return;
    }

    setIsAccepting(true);
    setError(null);

    try {
      const result = await authClient.organization.acceptInvitation({
        invitationId,
      });

      if ('error' in result && result.error) {
        setError(result.error.message || 'Failed to accept invitation');
        setIsAccepting(false);
        return;
      }

      setSuccess(true);

      // Redirect to the organization after a short delay
      setTimeout(() => {
        if (invitation?.organizationId) {
          router.push(`/${invitation.organizationId}/projects`);
        } else {
          router.push('/');
        }
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to accept invitation');
      setIsAccepting(false);
    }
  };

  const handleReject = async () => {
    setIsAccepting(true);
    setError(null);

    try {
      await authClient.organization.rejectInvitation({
        invitationId,
      });

      router.push('/');
    } catch {
      setError('Failed to reject invitation');
      setIsAccepting(false);
    }
  };

  if (isLoading || isAuthLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center justify-center p-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="mt-4 text-sm text-muted-foreground">Loading invitation...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error && !invitation) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <div className="flex items-center gap-2">
              <XCircle className="h-6 w-6 text-destructive" />
              <CardTitle>Invalid Invitation</CardTitle>
            </div>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => router.push('/')} className="w-full">
              Go to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-500" />
              <CardTitle>Invitation Accepted!</CardTitle>
            </div>
            <CardDescription>
              You've successfully joined the organization. Redirecting...
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  // Show simplified view when not authenticated
  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Organization Invitation</CardTitle>
            <CardDescription>
              You've been invited to join an organization
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-md bg-blue-500/10 p-3 text-sm text-blue-600 dark:text-blue-400">
              Sign in to view invitation details and accept.
            </div>

            <Button
              onClick={handleAccept}
              disabled={isAccepting}
              className="w-full"
            >
              {isAccepting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Redirecting...
                </>
              ) : (
                'Sign In to Continue'
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show full invitation details when authenticated
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Organization Invitation</CardTitle>
          <CardDescription>
            You've been invited to join {invitation?.organizationName || 'an organization'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {invitation && (
            <div className="rounded-lg border bg-muted/50 p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Organization:</span>
                <span className="font-medium">{invitation.organizationName}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Role:</span>
                <span className="font-medium capitalize">{invitation.role}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Invited by:</span>
                <span className="font-medium">{invitation.inviterEmail}</span>
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="flex gap-2">
            <Button
              onClick={handleAccept}
              disabled={isAccepting || !invitation}
              className="flex-1"
            >
              {isAccepting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Accepting...
                </>
              ) : (
                'Accept Invitation'
              )}
            </Button>
            <Button
              onClick={handleReject}
              variant="outline"
              disabled={isAccepting || !invitation}
              className="flex-1"
            >
              Decline
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

