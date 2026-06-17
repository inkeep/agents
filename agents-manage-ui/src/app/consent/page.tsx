'use client';

import { AlertCircleIcon, Loader2, ShieldCheck } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { InkeepIcon } from '@/components/icons/inkeep';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useRuntimeConfig } from '@/contexts/runtime-config';
import { useAuthSession } from '@/hooks/use-auth';

const SCOPE_LABELS: Record<string, string> = {
  openid: 'Verify your identity',
  profile: 'Access your profile information',
  email: 'Access your email address',
  offline_access: 'Stay connected (refresh tokens)',
};

function ConsentForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { PUBLIC_INKEEP_AGENTS_API_URL } = useRuntimeConfig();
  const { isAuthenticated, isLoading: isSessionLoading } = useAuthSession();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);
  const [resolvedClientName, setResolvedClientName] = useState<string | null>(null);

  const clientId = searchParams.get('client_id');

  // If the user lands here unauthenticated (e.g. session expired),
  // bounce to the login page preserving the OAuth query params so
  // the flow can resume after sign-in.
  useEffect(() => {
    if (!isSessionLoading && !isAuthenticated) {
      router.replace(`/login?${searchParams.toString()}`);
    }
  }, [isSessionLoading, isAuthenticated, router, searchParams]);

  // better-auth does not forward the registered client_name to this page, so
  // look it up from the public client metadata to show who is requesting access
  // (DCR clients like Cursor register a client_name) instead of a generic label.
  useEffect(() => {
    if (!isAuthenticated || !clientId) return;
    fetch(
      `${PUBLIC_INKEEP_AGENTS_API_URL}/api/auth/oauth2/public-client?client_id=${encodeURIComponent(clientId)}`,
      { credentials: 'include' }
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.client_name) setResolvedClientName(data.client_name);
      })
      .catch((err) => {
        // Non-fatal: fall back to the generic label, but surface the failure so a
        // systemic public-client lookup outage is diagnosable.
        console.warn('[consent] Failed to resolve client_name:', err);
      });
  }, [isAuthenticated, clientId, PUBLIC_INKEEP_AGENTS_API_URL]);

  const clientName = resolvedClientName || searchParams.get('client_name') || 'the application';
  const scope = searchParams.get('scope') || '';
  const scopes = scope.split(' ').filter(Boolean);

  const handleConsent = async (accept: boolean) => {
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`${PUBLIC_INKEEP_AGENTS_API_URL}/api/auth/oauth2/consent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          accept,
          scope,
          oauth_query: searchParams.toString(),
        }),
      });

      const data = await response.json();

      if (data.redirect && data.url) {
        // A native-app client (e.g. Cursor) registers a custom-scheme redirect
        // such as `cursor://...`. Launching it does not unload this tab, so the
        // submitting spinner would otherwise spin forever — surface a completion
        // state instead. Web (http/https) redirects navigate away normally.
        const isWebRedirect = /^https?:\/\//i.test(data.url);
        window.location.assign(data.url);
        if (!isWebRedirect) {
          setCompleted(true);
          setIsSubmitting(false);
        }
      } else if (!response.ok) {
        setError(data.error_description || 'Consent request failed');
        setIsSubmitting(false);
      }
    } catch {
      setError('Something went wrong. Please try again.');
      setIsSubmitting(false);
    }
  };

  if (isSessionLoading || !isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (completed) {
    return (
      <div className="flex flex-col min-h-screen items-center justify-center px-4 py-12">
        <Card className="w-full max-w-md shadow-none border-none bg-transparent space-y-3">
          <div className="px-6">
            <InkeepIcon size={48} />
          </div>
          <CardHeader>
            <CardTitle className="text-2xl font-medium tracking-tight text-foreground">
              Authorization complete
            </CardTitle>
            <CardDescription>
              <span className="font-medium text-foreground">{clientName}</span> is now connected.
              You can close this tab and return to {clientName}.
            </CardDescription>
          </CardHeader>
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
            Authorize
          </CardTitle>
          <CardDescription>
            <span className="font-medium text-foreground">{clientName}</span> is requesting access
            to your account.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {error && (
            <Alert variant="destructive" className="border-destructive/10 dark:border-border">
              <AlertCircleIcon className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <p className="text-sm font-medium">This will allow the application to:</p>
            <ul className="space-y-1.5">
              <li className="flex items-center gap-2 text-sm text-muted-foreground">
                <ShieldCheck className="h-4 w-4 shrink-0" />
                Manage your projects, agents, tools, and more, using your existing permissions
              </li>
              {scopes.map((s) => (
                <li key={s} className="flex items-center gap-2 text-sm text-muted-foreground">
                  <ShieldCheck className="h-4 w-4 shrink-0" />
                  {SCOPE_LABELS[s] || s}
                </li>
              ))}
            </ul>
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              variant="outline"
              className="flex-1"
              disabled={isSubmitting}
              onClick={() => handleConsent(false)}
            >
              Deny
            </Button>
            <Button className="flex-1" disabled={isSubmitting} onClick={() => handleConsent(true)}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Authorizing...
                </>
              ) : (
                'Allow'
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function ConsentPage() {
  return (
    <Suspense
      fallback={<div className="flex min-h-screen items-center justify-center">Loading...</div>}
    >
      <ConsentForm />
    </Suspense>
  );
}
