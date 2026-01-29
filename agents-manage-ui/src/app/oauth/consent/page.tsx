'use client';

import { CheckIcon, Loader2 } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { InkeepIcon } from '@/components/icons/inkeep';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useRuntimeConfig } from '@/contexts/runtime-config';

/**
 * Scope display configuration
 * Maps OAuth scopes to user-friendly labels
 */
const SCOPE_INFO: Record<string, { label: string; description: string }> = {
  openid: { label: 'Sign you in', description: 'Verify your identity' },
  profile: { label: 'View your profile', description: 'Name and basic info' },
  email: { label: 'View your email', description: 'Your email address' },
  offline_access: { label: 'Stay connected', description: "Access when you're away" },
  agents: { label: 'Use your agents', description: 'Run and manage AI agents' },
};

interface ClientInfo {
  client_id: string;
  client_name?: string;
  client_uri?: string;
  client_icon?: string;
  name?: string;
  uri?: string;
  icon?: string;
}

function ConsentForm() {
  const searchParams = useSearchParams();
  const { PUBLIC_INKEEP_AGENTS_MANAGE_API_URL } = useRuntimeConfig();

  const clientId = searchParams.get('client_id');
  const scopeParam = searchParams.get('scope') ?? '';
  const scopes = scopeParam.split(' ').filter(Boolean);

  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingClient, setIsFetchingClient] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [clientInfo, setClientInfo] = useState<ClientInfo | null>(null);

  // Fetch client info on mount
  useEffect(() => {
    async function fetchClientInfo() {
      if (!clientId) {
        setIsFetchingClient(false);
        return;
      }

      try {
        const response = await fetch(
          `${PUBLIC_INKEEP_AGENTS_MANAGE_API_URL}/api/oauth-clients/public?client_id=${clientId}`,
          { credentials: 'include' }
        );

        if (response.ok) {
          const data = await response.json();
          setClientInfo(data);
        }
      } catch {
        // Continue with defaults if fetch fails
      } finally {
        setIsFetchingClient(false);
      }
    }

    fetchClientInfo();
  }, [clientId, PUBLIC_INKEEP_AGENTS_MANAGE_API_URL]);

  const handleConsent = useCallback(
    async (accept: boolean) => {
      setIsLoading(true);
      setError(null);

      // Get all OAuth query params to pass back
      const oauthQuery = window.location.search.substring(1);

      try {
        const response = await fetch(
          `${PUBLIC_INKEEP_AGENTS_MANAGE_API_URL}/api/auth/oauth2/consent`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ accept, oauth_query: oauthQuery }),
          }
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error_description || data.error || 'Authorization failed');
        }

        // Handle redirect
        const redirectUrl = data.redirectTo || data.redirect_uri || data.uri;
        if (redirectUrl) {
          window.location.href = redirectUrl;
        } else {
          throw new Error('No redirect URL received');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
        setIsLoading(false);
      }
    },
    [PUBLIC_INKEEP_AGENTS_MANAGE_API_URL]
  );

  // Extract client name (handle both snake_case and camelCase)
  const clientName = clientInfo?.client_name || clientInfo?.name || 'Third-party Application';

  // Filter to only known scopes
  const displayScopes = scopes.filter((s) => SCOPE_INFO[s]);

  if (!clientId) {
    return (
      <div className="flex flex-col min-h-screen items-center justify-center px-4 py-12">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Invalid Request</CardTitle>
            <CardDescription>Missing client_id parameter</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (isFetchingClient) {
    return (
      <div className="flex flex-col min-h-screen items-center justify-center px-4 py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
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
            Authorize access
          </CardTitle>
          <CardDescription>
            <span className="font-semibold text-foreground">{clientName}</span> wants to access your
            account.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-5">
          {error && (
            <Alert variant="destructive" className="border-destructive/10 dark:border-border">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Permissions list */}
          <div>
            <p className="text-sm text-muted-foreground mb-3">This application will be able to:</p>
            <div className="space-y-2">
              {displayScopes.map((scope) => {
                const info = SCOPE_INFO[scope];
                return (
                  <div key={scope} className="flex items-start gap-3">
                    <CheckIcon className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                    <div>
                      <span className="text-sm font-medium text-foreground">{info.label}</span>
                      <span className="text-sm text-muted-foreground ml-1">
                        — {info.description}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex gap-3 pt-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => handleConsent(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button className="flex-1" onClick={() => handleConsent(true)} disabled={isLoading}>
              {isLoading ? (
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

export default function OAuthConsentPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <ConsentForm />
    </Suspense>
  );
}
