'use client';

import { AlertCircleIcon, CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ErrorContent } from '@/components/errors/full-page-error';
import { InkeepIcon } from '@/components/icons/inkeep';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuthClient } from '@/contexts/auth-client';
import { useAuthSession } from '@/hooks/use-auth';

export default function AcceptInvitationPage() {
  const params = useParams();
  const router = useRouter();
  const { user, isLoading: isAuthLoading } = useAuthSession();
  const invitationId = params.invitationId as string;
  const authClient = useAuthClient();

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
      // Workaround for a React Compiler limitation.
      // Todo: Support value blocks (conditional, logical, optional chaining, etc) within a try/catch statement
      async function doRequest() {
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
      }
      try {
        await doRequest();
      } catch {
        setError('Failed to load invitation');
      }
      setIsLoading(false);
    }

    fetchInvitation();
  }, [invitationId, user, authClient.organization.getInvitation]);

  const handleAccept = async () => {
    if (!user) {
      // Redirect to login with invitation param
      router.push(`/login?invitation=${invitationId}`);
      return;
    }

    setIsAccepting(true);
    setError(null);

    // Workaround for a React Compiler limitation.
    // Todo: Support value blocks (conditional, logical, optional chaining, etc) within a try/catch statement
    async function doRequest() {
      const result = await authClient.organization.acceptInvitation({
        invitationId,
      });

      if ('error' in result && result.error) {
        setError(result.error.message || 'Failed to accept invitation');
        setIsAccepting(false);
        return;
      }

      // Get the organization ID from the result or invitation
      const orgId =
        (result.data as { organizationId?: string })?.organizationId ?? invitation?.organizationId;

      // Set the newly joined organization as active so session is updated
      if (orgId) {
        await authClient.organization.setActive({
          organizationId: orgId,
        });
      }

      setSuccess(true);

      // Redirect to the organization after a short delay
      setTimeout(() => {
        if (orgId) {
          router.push(`/${orgId}/projects`);
        } else {
          router.push('/');
        }
      }, 2000);
    }

    try {
      await doRequest();
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
        <Card className="w-full max-w-md shadow-none border-none bg-transparent">
          <CardContent className="flex items-center justify-center p-8 space-x-2">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Loading invitation...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error && !invitation) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <ErrorContent
          title="Invalid invitation"
          icon={XCircle}
          showRetry={false}
          description={
            error ||
            'This invitation is no longer valid. Please contact the administrator of the organization to request a new invitation.'
          }
          link="/"
          linkText="Go home"
        />
      </div>
    );
  }

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md shadow-none border-none bg-transparent">
          <CardHeader>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-6 w-6 text-emerald-500 dark:text-emerald-400" />
              <CardTitle className="text-2xl font-medium tracking-tight text-foreground">
                Invitation accepted
              </CardTitle>
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
        <Card className="w-full max-w-md shadow-none border-none bg-transparent space-y-3">
          <div className="px-6">
            <InkeepIcon size={48} />
          </div>
          <CardHeader>
            <CardTitle className="text-2xl font-medium tracking-tight text-foreground">
              {invitation?.organizationName
                ? `Join ${invitation.organizationName} on Inkeep`
                : 'Accept invitation'}
            </CardTitle>
            <CardDescription>
              You've been invited to join{' '}
              {invitation?.organizationName ? (
                <span className="font-medium">{invitation?.organizationName}</span>
              ) : (
                'an organization'
              )}{' '}
              on Inkeep, please sign in to continue.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button onClick={handleAccept} disabled={isAccepting} className="w-full">
              {isAccepting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Redirecting...
                </>
              ) : (
                'Sign in to continue'
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
      <Card className="w-full max-w-md shadow-none border-none bg-transparent space-y-3">
        <div className="px-6">
          <InkeepIcon size={48} />
        </div>
        <CardHeader>
          <CardTitle className="text-2xl font-medium tracking-tight text-foreground">
            {invitation?.organizationName
              ? `Join ${invitation.organizationName} on Inkeep`
              : 'Accept invitation on Inkeep'}
          </CardTitle>
          <CardDescription>
            {invitation?.organizationName ? (
              <>
                You've been invited to join{' '}
                <span className="font-medium">{invitation.organizationName}</span> on Inkeep by{' '}
                <span className="font-medium">{invitation.inviterEmail}</span>.
              </>
            ) : (
              "You've been invited to join an organization on Inkeep."
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <Alert variant="destructive" className="border-destructive/10 dark:border-border">
              <AlertCircleIcon className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="flex gap-3">
            <Button onClick={handleAccept} disabled={isAccepting || !invitation} className="flex-1">
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
