'use client';

import { AlertCircleIcon, CheckCircle2, Loader2 } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { InkeepIcon } from '@/components/icons/inkeep';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { slackApi } from '@/features/work-apps/slack/api/slack-api';
import { useAuthSession } from '@/hooks/use-auth';

type LinkState = 'waiting' | 'linking' | 'success' | 'error';

const isExpiredTokenError = (error: string | null) =>
  error?.toLowerCase().includes('expired') ?? false;

function SuccessState({ slackUsername }: { slackUsername?: string }) {
  const [countdown, setCountdown] = useState(3);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          window.close();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  return (
    <div className="space-y-4 text-center">
      <div className="flex justify-center">
        <CheckCircle2 className="h-16 w-16 text-green-500" />
      </div>
      <div>
        <p className="font-medium text-lg">Account Linked!</p>
        <p className="text-sm text-muted-foreground mt-2">
          {slackUsername ? (
            <>
              Your Slack account <strong>@{slackUsername}</strong> is now connected to Inkeep.
            </>
          ) : (
            'Your Slack account is now connected to Inkeep.'
          )}
        </p>
      </div>
      <div className="pt-4">
        <p className="text-sm text-muted-foreground">You can now use Inkeep agents in Slack!</p>
        <p className="text-xs text-muted-foreground mt-2">
          This window will close in {countdown}...
        </p>
      </div>
    </div>
  );
}

function SlackLinkForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isAuthenticated, isLoading: authLoading } = useAuthSession();

  const initialToken = searchParams.get('token') || '';
  const [state, setState] = useState<LinkState>('waiting');
  const [error, setError] = useState<string | null>(null);
  const [linkResult, setLinkResult] = useState<{
    slackUsername?: string;
    slackTeamId?: string;
  } | null>(null);

  const handleLinkWithToken = useCallback(
    async (token: string) => {
      if (!user?.id) {
        setError('You must be logged in to link your Slack account.');
        setState('error');
        return;
      }

      setState('linking');
      setError(null);

      try {
        const result = await slackApi.verifyLinkToken({
          token,
          userId: user.id,
          userEmail: user.email,
        });

        if (!result.success) {
          setError(result.error || 'Failed to link account');
          setState('error');
          return;
        }

        setLinkResult({
          slackUsername: result.slackUsername,
          slackTeamId: result.slackTeamId,
        });
        setState('success');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to link account');
        setState('error');
      }
    },
    [user]
  );

  useEffect(() => {
    if (isAuthenticated && user?.id && state === 'waiting' && initialToken) {
      handleLinkWithToken(initialToken);
    }
  }, [initialToken, isAuthenticated, user?.id, state, handleLinkWithToken]);

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAuthenticated && initialToken) {
    const isExpiredError = isExpiredTokenError(error);

    return (
      <div className="flex flex-col min-h-screen items-center justify-center px-4 py-12">
        <Card className="w-full max-w-md shadow-none border-none bg-transparent space-y-3">
          <div className="px-6">
            <InkeepIcon size={48} />
          </div>
          <CardHeader>
            <CardTitle className="text-2xl font-medium tracking-tight text-foreground">
              Connect your Inkeep account
            </CardTitle>
            <CardDescription>Sign in to start using the bot in Slack.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {isExpiredError && (
              <Alert variant="destructive" className="border-destructive/10 dark:border-border">
                <AlertCircleIcon className="h-4 w-4" />
                <AlertDescription>
                  This link has expired. Try{' '}
                  <code className="bg-muted px-1 py-0.5 rounded">/inkeep link</code> on Slack to get
                  a new link.
                </AlertDescription>
              </Alert>
            )}

            <Button
              className="w-full"
              onClick={() => {
                const currentPath = window.location.pathname + window.location.search;
                router.push(`/login?returnUrl=${encodeURIComponent(currentPath)}`);
              }}
            >
              Sign in
            </Button>

            <div className="text-center pt-2">
              <p className="font-medium">Don&apos;t have an account?</p>
              <p className="text-sm text-muted-foreground">Ask your administrator for an invite.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col min-h-screen items-center justify-center px-4 py-12">
        <Card className="w-full max-w-md shadow-none border-none bg-transparent space-y-3">
          <div className="px-6">
            <InkeepIcon size={48} />
          </div>
          <CardHeader>
            <CardTitle className="text-2xl font-medium tracking-tight text-foreground">
              Link Slack Account
            </CardTitle>
            <CardDescription>Use /inkeep link in Slack to link your account.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="text-center space-y-4 py-4">
              <p className="text-sm text-muted-foreground">
                To link your Slack account, run{' '}
                <code className="bg-muted px-1 py-0.5 rounded">/inkeep link</code> in Slack.
              </p>
              <p className="text-xs text-muted-foreground">
                You&apos;ll receive a link to complete the connection.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen items-center justify-center px-4 py-12">
      <Card className="w-full max-w-md shadow-none border-none bg-transparent space-y-3">
        <div className="px-6">
          <InkeepIcon size={48} />
        </div>
        <CardHeader>
          <CardTitle className="text-2xl font-medium tracking-tight text-foreground">
            Link Slack Account
          </CardTitle>
          <CardDescription>
            {state === 'waiting'
              ? 'Use /inkeep link in Slack to link your account.'
              : state === 'linking'
                ? 'Linking your accounts...'
                : state === 'success'
                  ? 'Your accounts are now linked!'
                  : 'An error occurred.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {error && (
            <Alert variant="destructive" className="border-destructive/10 dark:border-border">
              <AlertCircleIcon className="h-4 w-4" />
              <AlertDescription>
                {isExpiredTokenError(error) ? (
                  <>
                    This link has expired. Try{' '}
                    <code className="bg-muted px-1 py-0.5 rounded">/inkeep link</code> on Slack to
                    get a new link.
                  </>
                ) : (
                  error
                )}
              </AlertDescription>
            </Alert>
          )}

          {(state === 'waiting' || state === 'error') && !initialToken && (
            <div className="text-center space-y-4 py-4">
              <p className="text-sm text-muted-foreground">
                To link your Slack account, run{' '}
                <code className="bg-muted px-1 py-0.5 rounded">/inkeep link</code> in Slack.
              </p>
              <p className="text-xs text-muted-foreground">
                You&apos;ll receive a link to complete the connection.
              </p>
            </div>
          )}

          {state === 'linking' && (
            <div className="flex flex-col items-center justify-center py-8 space-y-4">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Linking your Slack account...</p>
            </div>
          )}

          {state === 'success' && <SuccessState slackUsername={linkResult?.slackUsername} />}
        </CardContent>
      </Card>
    </div>
  );
}

export default function LinkPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <SlackLinkForm />
    </Suspense>
  );
}
