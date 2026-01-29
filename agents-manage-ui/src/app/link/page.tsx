'use client';

import { AlertCircleIcon, CheckCircle2, Loader2, MessageSquare } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { InkeepIcon } from '@/components/icons/inkeep';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { slackApi } from '@/features/slack/api/slack-api';
import { useAuthSession } from '@/hooks/use-auth';

type LinkState = 'input' | 'linking' | 'success' | 'error';

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

function formatCode(code: string): string {
  const cleaned = code.replace(/[^A-Z0-9]/gi, '').toUpperCase();
  if (cleaned.length >= 4) {
    return `${cleaned.slice(0, 4)}-${cleaned.slice(4, 8)}`;
  }
  return cleaned;
}

function SlackLinkForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isAuthenticated, isLoading: authLoading } = useAuthSession();

  const initialCode = searchParams.get('code') || '';
  const [code, setCode] = useState(initialCode);
  const [state, setState] = useState<LinkState>('input');
  const [error, setError] = useState<string | null>(null);
  const [linkResult, setLinkResult] = useState<{
    slackUsername?: string;
    slackTeamId?: string;
  } | null>(null);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      const currentPath = window.location.pathname + window.location.search;
      router.push(`/login?returnUrl=${encodeURIComponent(currentPath)}`);
    }
  }, [authLoading, isAuthenticated, router]);

  const handleLink = useCallback(
    async (linkCode: string) => {
      if (!user?.id) {
        setError('You must be logged in to link your Slack account.');
        setState('error');
        return;
      }

      setState('linking');
      setError(null);

      try {
        const result = await slackApi.confirmLink({
          code: linkCode,
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
    if (initialCode && isAuthenticated && user?.id && state === 'input') {
      handleLink(initialCode);
    }
  }, [initialCode, isAuthenticated, user?.id, state, handleLink]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    await handleLink(code);
  };

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen items-center justify-center px-4 py-12">
      <Card className="w-full max-w-md shadow-none border-none bg-transparent space-y-3">
        <div className="flex justify-center">
          <InkeepIcon size={48} />
        </div>
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-medium tracking-tight text-foreground flex items-center justify-center gap-2">
            <MessageSquare className="h-6 w-6" />
            Link Slack Account
          </CardTitle>
          <CardDescription>
            {state === 'input'
              ? 'Enter the code from Slack to link your account.'
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
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {(state === 'input' || state === 'error') && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="code">Link Code</Label>
                <Input
                  id="code"
                  type="text"
                  placeholder="XXXX-XXXX"
                  value={formatCode(code)}
                  onChange={(e) => setCode(e.target.value.replace(/[^A-Z0-9-]/gi, ''))}
                  required
                  maxLength={9}
                  className="text-center text-2xl font-mono tracking-widest"
                  autoComplete="off"
                  autoFocus
                />
                <p className="text-xs text-muted-foreground text-center">
                  Run <code className="bg-muted px-1 py-0.5 rounded">/inkeep link</code> in Slack to
                  get your code
                </p>
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={code.replace(/-/g, '').length !== 8}
              >
                Link Account
              </Button>
            </form>
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
