'use client';

import type { MethodOption, OrgAuthInfo } from '@inkeep/agents-core/auth/auth-types';
import { authLookupResponseSchema } from '@inkeep/agents-core/auth/auth-types';
import { AlertCircleIcon, ArrowLeft, Globe, Loader2, Mail } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';
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

type LoginState =
  | { step: 'email' }
  | { step: 'org-picker'; orgs: OrgAuthInfo[] }
  | { step: 'method-picker'; org: OrgAuthInfo; multiOrg: boolean }
  | { step: 'password'; fromOrg?: OrgAuthInfo; multiOrg?: boolean };

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const invitationId = searchParams.get('invitation');
  const returnUrl = searchParams.get('returnUrl');
  const authClient = useAuthClient();
  const { PUBLIC_IS_SMTP_CONFIGURED, PUBLIC_INKEEP_AGENTS_API_URL } = useRuntimeConfig();
  const posthog = usePostHog();
  const { isAuthenticated, isLoading: isSessionLoading } = useAuthSession();

  const [state, setState] = useState<LoginState>({ step: 'email' });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isLookingUp, setIsLookingUp] = useState(false);

  const urlError = searchParams.get('error');
  const urlErrorDescription = searchParams.get('error_description');
  const initialError = urlError ? `${urlErrorDescription || urlError}`.replace(/_/g, ' ') : null;
  const [error, setError] = useState<string | null>(initialError);

  const lastMethod = authClient.getLastUsedLoginMethod();

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

  const getRedirectUrl = (): string => {
    if (invitationId) return `/accept-invitation/${invitationId}`;
    return getSafeReturnUrl(returnUrl, '/');
  };

  function getFullCallbackURL() {
    const baseURL = window.location.origin;
    const params = new URLSearchParams();
    if (invitationId) params.set('invitation', invitationId);
    if (returnUrl && isValidReturnUrl(returnUrl) && returnUrl !== '/')
      params.set('returnUrl', returnUrl);
    const queryString = params.toString();
    return queryString ? `${baseURL}/?${queryString}` : `${baseURL}/`;
  }

  const executeMethodSignIn = async (method: MethodOption) => {
    setError(null);
    setIsLoading(true);

    const fromOrg = state.step === 'method-picker' ? state.org : undefined;
    const multiOrg = state.step === 'method-picker' ? state.multiOrg : undefined;

    try {
      if (method.method === 'sso') {
        const result = await authClient.signIn.sso({
          email,
          providerId: method.providerId,
          callbackURL: getFullCallbackURL(),
        });
        if (result?.error) {
          setError(result.error.message || 'SSO sign in failed');
          setIsLoading(false);
        }
      } else if (method.method === 'google') {
        const result = await authClient.signIn.social({
          provider: 'google',
          callbackURL: getFullCallbackURL(),
          loginHint: email,
        });
        if (result?.error) {
          setError(result.error.message || 'Google sign in failed');
          setIsLoading(false);
        }
      } else {
        setState({ step: 'password', fromOrg, multiOrg });
        setIsLoading(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed');
      setIsLoading(false);
    }
  };

  const handleEmailContinue = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLookingUp(true);

    try {
      const response = await fetch(
        `${PUBLIC_INKEEP_AGENTS_API_URL}/manage/api/auth-lookup?email=${encodeURIComponent(email)}`
      );

      if (!response.ok) {
        setState({ step: 'password' });
        setIsLookingUp(false);
        return;
      }

      const result = authLookupResponseSchema.parse(await response.json());
      const orgs = result.organizations;

      if (orgs.length === 0) {
        setState({ step: 'password' });
      } else if (orgs.length === 1) {
        setState({ step: 'method-picker', org: orgs[0], multiOrg: false });
      } else {
        setState({ step: 'org-picker', orgs });
      }
    } catch {
      setState({ step: 'password' });
    } finally {
      setIsLookingUp(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const result = await authClient.signIn.email({ email, password });

      if (result?.error) {
        setError(result.error.message || 'Sign in failed');
        setIsLoading(false);
        return;
      }

      if (result?.data?.user) {
        posthog?.identify(result.data.user.id, {
          email: result.data.user.email,
          name: result.data.user.name,
        });
      }

      router.replace(getRedirectUrl());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
      setIsLoading(false);
    }
  };

  const handleBack = () => {
    if (state.step === 'password' && state.fromOrg) {
      setState({ step: 'method-picker', org: state.fromOrg, multiOrg: state.multiOrg ?? false });
    } else if (state.step === 'password') {
      setState({ step: 'email' });
    } else if (state.step === 'method-picker' && state.multiOrg) {
      setError(null);
      setState({ step: 'org-picker', orgs: [] });
      handleEmailContinue({ preventDefault: () => {} } as React.FormEvent);
    } else if (state.step === 'method-picker') {
      setState({ step: 'email' });
    } else if (state.step === 'org-picker') {
      setState({ step: 'email' });
    }
    setPassword('');
    setError(null);
  };

  if (isSessionLoading || isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const getDescription = () => {
    switch (state.step) {
      case 'email':
        return 'Enter your email to continue.';
      case 'org-picker':
        return 'Select the organization you want to sign in to.';
      case 'method-picker':
        return `Sign in to ${state.org.organizationName}`;
      case 'password':
        return 'Enter your password to sign in.';
    }
  };

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
          <CardDescription>{getDescription()}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {error && (
            <Alert variant="destructive" className="border-destructive/10 dark:border-border">
              <AlertCircleIcon className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {state.step === 'email' && (
            <>
              <form onSubmit={handleEmailContinue} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={isLookingUp || isLoading}
                    autoFocus
                  />
                </div>

                <Button type="submit" className="w-full" disabled={isLookingUp || isLoading}>
                  {isLookingUp || isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {isLoading ? 'Redirecting...' : 'Looking up...'}
                    </>
                  ) : (
                    'Continue'
                  )}
                </Button>
              </form>
            </>
          )}

          {state.step === 'org-picker' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 rounded-md border px-3 py-2">
                <span className="text-sm flex-1 truncate">{email}</span>
                <button
                  type="button"
                  onClick={handleBack}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0"
                >
                  Change
                </button>
              </div>

              <div className="grid gap-2">
                {state.orgs.map((org) => (
                  <button
                    key={org.organizationId}
                    type="button"
                    className="flex items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/50"
                    onClick={() => setState({ step: 'method-picker', org, multiOrg: true })}
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted text-sm font-medium">
                      {org.organizationName.charAt(0).toUpperCase()}
                    </div>
                    <div className="space-y-0.5 flex-1">
                      <p className="text-sm font-medium">{org.organizationName}</p>
                      <p className="text-xs text-muted-foreground">
                        {org.methods.length} sign-in method{org.methods.length !== 1 ? 's' : ''}
                      </p>
                    </div>
                  </button>
                ))}
              </div>

              <button
                type="button"
                className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
                onClick={handleBack}
              >
                <ArrowLeft className="h-3 w-3" />
                Back
              </button>
            </div>
          )}

          {state.step === 'method-picker' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 rounded-md border px-3 py-2">
                <span className="text-sm flex-1 truncate">{email}</span>
                <button
                  type="button"
                  onClick={handleBack}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0"
                >
                  Change
                </button>
              </div>

              {state.org.methods.length === 0 ? (
                <div className="rounded-lg border border-dashed p-4 text-center space-y-1">
                  <p className="text-sm font-medium">No sign-in methods available</p>
                  <p className="text-xs text-muted-foreground">
                    Your email domain doesn&apos;t match any configured sign-in methods for{' '}
                    {state.org.organizationName}. Contact your organization administrator.
                  </p>
                </div>
              ) : (
                <div className="grid gap-2">
                  {[...state.org.methods]
                    .sort((a, b) => {
                      const aLast = isLastUsedMethod(a, lastMethod) ? -1 : 0;
                      const bLast = isLastUsedMethod(b, lastMethod) ? -1 : 0;
                      return aLast - bLast;
                    })
                    .map((method, idx) => {
                      const isLast = isLastUsedMethod(method, lastMethod);
                      return (
                        <button
                          key={method.providerId ?? `${method.method}-${idx}`}
                          type="button"
                          disabled={isLoading}
                          className={`flex items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/50 disabled:opacity-50 disabled:cursor-not-allowed ${isLast ? 'ring-1 ring-primary/20 border-primary/30' : ''}`}
                          onClick={() => executeMethodSignIn(method)}
                        >
                          <MethodIcon method={method} />
                          <span className="text-sm font-medium flex-1">
                            {getMethodDisplayLabel(method)}
                          </span>
                          {isLast && (
                            <span className="text-[11px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full shrink-0">
                              Last used
                            </span>
                          )}
                        </button>
                      );
                    })}
                </div>
              )}

              <button
                type="button"
                className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
                onClick={handleBack}
              >
                <ArrowLeft className="h-3 w-3" />
                Back
              </button>
            </div>
          )}

          {state.step === 'password' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 rounded-md border px-3 py-2">
                <span className="text-sm flex-1 truncate">{email}</span>
                <button
                  type="button"
                  onClick={handleBack}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0"
                >
                  Change
                </button>
              </div>

              <form onSubmit={handlePasswordSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={isLoading}
                    minLength={8}
                    autoFocus
                  />
                </div>
                {PUBLIC_IS_SMTP_CONFIGURED && (
                  <Link
                    href={`/forgot-password${email ? `?email=${encodeURIComponent(email)}` : ''}`}
                    className="block text-right text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors -mt-2"
                  >
                    Forgot password?
                  </Link>
                )}

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

              <button
                type="button"
                className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
                onClick={handleBack}
              >
                <ArrowLeft className="h-3 w-3" />
                Back
              </button>
            </div>
          )}

          <div className="flex items-center justify-center gap-1 text-sm">
            <p className="font-medium">Don&apos;t have an account?</p>
            <p className="text-muted-foreground">Ask your administrator for an invite.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function MethodIcon({ method }: { method: MethodOption }) {
  if (method.method === 'google') return <GoogleColorIcon className="h-5 w-5 shrink-0" />;
  if (method.method === 'sso') return <Globe className="h-5 w-5 text-muted-foreground shrink-0" />;
  return <Mail className="h-5 w-5 text-muted-foreground shrink-0" />;
}

function getMethodDisplayLabel(method: MethodOption): string {
  if (method.method === 'sso') {
    return method.displayName ? `Continue with ${method.displayName}` : 'Continue with SSO';
  }
  if (method.method === 'google') return 'Continue with Google';
  return 'Continue with email and password';
}

function isLastUsedMethod(method: MethodOption, lastMethod: string | null): boolean {
  if (!lastMethod) return false;
  if (method.method === 'email-password')
    return lastMethod === 'email' || lastMethod === 'credential';
  if (method.method === 'google') return lastMethod === 'google';
  if (method.method === 'sso') return method.providerId === lastMethod;
  return false;
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
