'use client';

import { AlertCircleIcon, Loader2 } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { GoogleColorIcon } from '@/components/icons/google';
import { InkeepIcon } from '@/components/icons/inkeep';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuthClient } from '@/contexts/auth-client';
import { usePostHog } from '@/contexts/posthog';
import { useRuntimeConfig } from '@/contexts/runtime-config';
import { useAuthSession } from '@/hooks/use-auth';
import { getSafeReturnUrl, isValidReturnUrl } from '@/lib/utils/auth-redirect';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const invitationId = searchParams.get('invitation');
  const returnUrl = searchParams.get('returnUrl');
  const authClient = useAuthClient();
  const { PUBLIC_AUTH0_DOMAIN, PUBLIC_GOOGLE_CLIENT_ID } = useRuntimeConfig();
  const posthog = usePostHog();
  const { isAuthenticated, isLoading: isSessionLoading } = useAuthSession();

  // Redirect authenticated users away from login page
  useEffect(() => {
    if (!isSessionLoading && isAuthenticated) {
      if (invitationId) {
        router.replace(`/accept-invitation/${invitationId}`);
      } else if (returnUrl && isValidReturnUrl(returnUrl)) {
        router.replace(returnUrl);
      } else {
        router.replace('/');
      }
    }
  }, [isAuthenticated, isSessionLoading, invitationId, returnUrl, router]);

  // Get the validated return URL for post-login redirect (used for email login)
  const getRedirectUrl = (): string => {
    if (invitationId) {
      return `/accept-invitation/${invitationId}`;
    }
    return getSafeReturnUrl(returnUrl, '/');
  };

  // For OAuth, we need the full URL to redirect back to the UI
  // OAuth must callback to `/` (home page) which handles the auth completion
  // We pass returnUrl/invitation as query params for post-auth redirect
  const getFullCallbackURL = () => {
    if (typeof window === 'undefined') return '/';
    const baseURL = window.location.origin;

    // Build callback URL with appropriate query params
    const params = new URLSearchParams();
    if (invitationId) {
      params.set('invitation', invitationId);
    } else if (returnUrl && isValidReturnUrl(returnUrl)) {
      params.set('returnUrl', returnUrl);
    }

    const queryString = params.toString();
    return queryString ? `${baseURL}/?${queryString}` : `${baseURL}/`;
  };

  const [isLoading, setIsLoading] = useState(false);

  // Check for OAuth/SSO errors in URL params (e.g., from provider redirects)
  const urlError = searchParams.get('error');
  const urlErrorDescription = searchParams.get('error_description');
  const initialError = urlError ? `${urlErrorDescription || urlError}`.replace(/_/g, ' ') : null;

  const [error, setError] = useState<string | null>(initialError);

  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const result = await authClient.signIn.email({
        email: formData.email,
        password: formData.password,
      });

      // Check if sign-in failed
      if (result?.error) {
        setError(result.error.message || 'Sign in failed');
        setIsLoading(false);
        return;
      }

      if (result?.data?.user) {
        const user = result.data.user;
        posthog?.identify(user.id, {
          email: user.email,
          name: user.name,
        });
      }

      // Redirect to the intended destination
      router.replace(getRedirectUrl());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
      setIsLoading(false);
    }
  };

  const handleExternalSignIn = async (
    method: 'social' | 'sso',
    identifier: string,
    fallbackError: string
  ) => {
    setIsLoading(true);
    setError(null);

    try {
      const result =
        method === 'social'
          ? await authClient.signIn.social({
              provider: identifier as 'google',
              callbackURL: getFullCallbackURL(),
            })
          : await authClient.signIn.sso({
              providerId: identifier,
              callbackURL: getFullCallbackURL(),
            });

      // If we got here without redirecting, something went wrong
      if (result?.error) {
        setError(result.error.message || fallbackError);
        setIsLoading(false);
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error
          ? err.message
          : typeof err === 'object' && err !== null
            ? (err as any).message || (err as any).error || fallbackError
            : fallbackError;

      setError(errorMessage);
      setIsLoading(false);
    }
  };

  // Show loading state while checking authentication
  if (isSessionLoading || isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
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
            Welcome
          </CardTitle>
          <CardDescription>Please sign in to your account to continue.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {error && (
            <Alert variant="destructive" className="border-destructive/10 dark:border-border">
              <AlertCircleIcon className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                required
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                required
                disabled={isLoading}
                minLength={8}
              />
            </div>

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Signing in...
                </>
              ) : (
                'Sign in'
              )}
            </Button>
          </form>

          {(PUBLIC_AUTH0_DOMAIN || PUBLIC_GOOGLE_CLIENT_ID) && (
            <>
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center ">
                  <span className="bg-background px-2 text-muted-foreground font-mono text-xs uppercase">
                    Or
                  </span>
                </div>
              </div>

              <div className="space-y-3">
                {PUBLIC_AUTH0_DOMAIN && (
                  <Button
                    variant="gray-outline"
                    onClick={() => handleExternalSignIn('sso', 'auth0', 'Inkeep sign in failed')}
                    disabled={isLoading}
                    className="w-full"
                  >
                    <InkeepIcon />
                    Continue with Inkeep SSO
                  </Button>
                )}
                {PUBLIC_GOOGLE_CLIENT_ID && (
                  <Button
                    variant="gray-outline"
                    onClick={() =>
                      handleExternalSignIn('social', 'google', 'Google sign in failed')
                    }
                    disabled={isLoading}
                    className="w-full"
                  >
                    <GoogleColorIcon />
                    Continue with Google
                  </Button>
                )}
              </div>
            </>
          )}

          <div className="text-center pt-2">
            <p className="font-medium">Don&apos;t have an account?</p>
            <p className="text-sm text-muted-foreground">Ask your administrator for an invite.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={<div className="flex min-h-screen items-center justify-center">Loading...</div>}
    >
      <LoginForm />
    </Suspense>
  );
}
