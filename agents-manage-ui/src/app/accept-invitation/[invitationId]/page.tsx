'use client';

import { AlertCircleIcon, CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { use, useCallback, useEffect, useState } from 'react';
import { ErrorContent } from '@/components/errors/full-page-error';
import { GoogleColorIcon } from '@/components/icons/google';
import { InkeepIcon } from '@/components/icons/inkeep';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuthClient } from '@/contexts/auth-client';
import { useRuntimeConfig } from '@/contexts/runtime-config';
import { useAuthSession } from '@/hooks/use-auth';
import { type InvitationVerification, verifyInvitation } from '@/lib/actions/invitations';
import { updateUserProfileTimezone } from '@/lib/actions/user-profile';
import { getSafeReturnUrl, isValidReturnUrl } from '@/lib/utils/auth-redirect';

export default function AcceptInvitationPage({
  params,
}: PageProps<'/accept-invitation/[invitationId]'>) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const emailFromUrl = searchParams.get('email');
  const returnUrl = searchParams.get('returnUrl');
  const { user, isLoading: isAuthLoading } = useAuthSession();
  const { invitationId } = use(params);
  const authClient = useAuthClient();
  const { PUBLIC_AUTH0_DOMAIN, PUBLIC_GOOGLE_CLIENT_ID } = useRuntimeConfig();

  const [invitationVerification, setInvitationVerification] =
    useState<InvitationVerification | null>(null);
  // Full invitation (fetched with auth)
  const [invitation, setInvitation] = useState<typeof authClient.$Infer.Invitation | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Signup form state
  const [formData, setFormData] = useState({
    name: '',
    password: '',
  });

  // For OAuth, build a callback URL that redirects back to this page after auth
  const getFullCallbackURL = useCallback(() => {
    if (typeof window === 'undefined') return '/';
    const baseURL = window.location.origin;
    const params = new URLSearchParams();
    params.set('invitation', invitationId);
    if (returnUrl && isValidReturnUrl(returnUrl)) {
      params.set('returnUrl', returnUrl);
    }
    return `${baseURL}/?${params.toString()}`;
  }, [invitationId, returnUrl]);

  // Fetch invitation verification (unauthenticated) when email is provided in URL
  useEffect(() => {
    async function fetchInvitationVerification() {
      if (!invitationId || !emailFromUrl) {
        setIsLoading(false);
        return;
      }

      try {
        const result = await verifyInvitation(invitationId, emailFromUrl);

        if (result.valid) {
          setInvitationVerification(result);
        } else {
          setError('error' in result ? result.error : 'Invalid invitation');
        }
      } catch {
        setError('Failed to validate invitation');
      } finally {
        setIsLoading(false);
      }
    }

    // Only fetch verification if not authenticated
    if (!user && !isAuthLoading) {
      fetchInvitationVerification();
    }
  }, [invitationId, emailFromUrl, user, isAuthLoading]);

  // Fetch full invitation details when authenticated
  useEffect(() => {
    async function fetchInvitation() {
      if (!invitationId || !user) return;

      if (isSubmitting || success) return;

      setIsLoading(true);
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

    if (user) {
      fetchInvitation();
    }
  }, [invitationId, user, authClient, isSubmitting, success]);

  // Handle signup + accept invitation
  const handleSignupAndAccept = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!invitationVerification || !emailFromUrl) return;

    setIsSubmitting(true);
    setError(null);

    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    try {
      // Step 1: Sign up with email/password
      const signupResult = await authClient.signUp.email({
        email: emailFromUrl,
        password: formData.password,
        name: formData.name,
      });

      if (signupResult?.error) {
        setError(signupResult.error.message || 'Failed to create account');
        setIsSubmitting(false);
        return;
      }

      // Step 1b: Set timezone on the new user's profile
      const newUserId = signupResult.data?.user?.id;
      if (newUserId) {
        try {
          await updateUserProfileTimezone(newUserId, timezone);
        } catch {
          // Silently ignore — timezone update is best-effort
        }
      }

      // Step 2: Accept the invitation (user is now signed in due to autoSignIn: true)
      const acceptResult = await authClient.organization.acceptInvitation({
        invitationId,
      });

      if ('error' in acceptResult && acceptResult.error) {
        setError(acceptResult.error.message || 'Failed to accept invitation');
        setIsSubmitting(false);
        return;
      }

      // Step 3: Set the organization as active
      const orgId = invitationVerification.organizationId;
      if (orgId) {
        await authClient.organization.setActive({
          organizationId: orgId,
        });
      }

      setSuccess(true);

      setTimeout(() => {
        router.push(getSafeReturnUrl(returnUrl, orgId ? `/${orgId}/projects` : '/'));
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create account');
      setIsSubmitting(false);
    }
  };

  // Handle accept (for authenticated users)
  const handleAccept = async () => {
    if (!user) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const result = await authClient.organization.acceptInvitation({
        invitationId,
      });

      if ('error' in result && result.error) {
        setError(result.error.message || 'Failed to accept invitation');
        setIsSubmitting(false);
        return;
      }

      const orgId =
        (result.data as { organizationId?: string })?.organizationId ?? invitation?.organizationId;

      if (orgId) {
        await authClient.organization.setActive({
          organizationId: orgId,
        });
      }

      setSuccess(true);

      setTimeout(() => {
        router.push(getSafeReturnUrl(returnUrl, orgId ? `/${orgId}/projects` : '/'));
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to accept invitation');
      setIsSubmitting(false);
    }
  };

  const handleReject = async () => {
    setIsSubmitting(true);
    setError(null);

    try {
      await authClient.organization.rejectInvitation({
        invitationId,
      });
      router.push('/');
    } catch {
      setError('Failed to reject invitation');
      setIsSubmitting(false);
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

  // Error state (no invitation found)
  if (error && !invitation && !invitationVerification) {
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
                Welcome!
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

  // Handle external sign-in (Google / SSO) for unauthenticated invitation flow
  const handleExternalSignIn = async (
    method: 'social' | 'sso',
    identifier: string,
    fallbackError: string
  ) => {
    setIsSubmitting(true);
    setError(null);

    try {
      const result =
        method === 'social'
          ? await authClient.signIn.social({
              provider: identifier as 'google',
              callbackURL: getFullCallbackURL(),
              ...(emailFromUrl && { loginHint: emailFromUrl }),
            })
          : await authClient.signIn.sso({
              providerId: identifier,
              callbackURL: getFullCallbackURL(),
              ...(emailFromUrl && { loginHint: emailFromUrl }),
            });

      if (result?.error) {
        setError(result.error.message || fallbackError);
        setIsSubmitting(false);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : fallbackError;
      setError(errorMessage);
      setIsSubmitting(false);
    }
  };

  // Unauthenticated: Show auth-method-aware UI
  if (!user && invitationVerification) {
    const orgName = invitationVerification.organizationName;
    const authMethod = invitationVerification.authMethod;
    const isGoogleAuth = authMethod === 'google';
    const isSSOAuth = authMethod === 'sso' || authMethod === 'auth0';
    const isEmailPassword = !isGoogleAuth && !isSSOAuth;

    const getDescription = () => {
      const invitePrefix = orgName ? (
        <>
          You've been invited to join <span className="font-medium">{orgName}</span>.{' '}
        </>
      ) : (
        <>You've been invited to join an organization. </>
      );

      if (isGoogleAuth) {
        return <>{invitePrefix}Sign in with your Google account to get started.</>;
      }
      if (isSSOAuth) {
        return <>{invitePrefix}Sign in with your organization's SSO to get started.</>;
      }
      return <>{invitePrefix}Create your account to get started.</>;
    };

    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md shadow-none border-none bg-transparent space-y-3">
          <div className="px-6">
            <InkeepIcon size={48} />
          </div>
          <CardHeader>
            <CardTitle className="text-2xl font-medium tracking-tight text-foreground">
              {orgName ? `Join ${orgName}` : 'Accept invitation'}
            </CardTitle>
            <CardDescription>{getDescription()}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {error && (
              <Alert variant="destructive" className="border-destructive/10 dark:border-border">
                <AlertCircleIcon aria-hidden className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {isGoogleAuth && PUBLIC_GOOGLE_CLIENT_ID && (
              <Button
                variant="gray-outline"
                onClick={() => handleExternalSignIn('social', 'google', 'Google sign in failed')}
                disabled={isSubmitting}
                className="w-full"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 aria-hidden className="mr-2 h-4 w-4 animate-spin" />
                    Redirecting...
                  </>
                ) : (
                  <>
                    <GoogleColorIcon aria-hidden />
                    Continue with Google
                  </>
                )}
              </Button>
            )}

            {isSSOAuth && PUBLIC_AUTH0_DOMAIN && (
              <Button
                variant="gray-outline"
                onClick={() => handleExternalSignIn('sso', 'auth0', 'SSO sign in failed')}
                disabled={isSubmitting}
                className="w-full"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 aria-hidden className="mr-2 h-4 w-4 animate-spin" />
                    Redirecting...
                  </>
                ) : (
                  <>
                    <InkeepIcon aria-hidden />
                    Continue with SSO
                  </>
                )}
              </Button>
            )}

            {((isGoogleAuth && !PUBLIC_GOOGLE_CLIENT_ID) ||
              (isSSOAuth && !PUBLIC_AUTH0_DOMAIN)) && (
              <Alert className="border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950">
                <AlertCircleIcon aria-hidden className="h-4 w-4 text-amber-600" />
                <AlertDescription>
                  The sign-in method for this invitation is not available. Please contact your
                  organization administrator.
                </AlertDescription>
              </Alert>
            )}

            {isEmailPassword && (
              <form onSubmit={handleSignupAndAccept} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={emailFromUrl || ''}
                    disabled
                    className="bg-muted"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="name">Full name</Label>
                  <Input
                    id="name"
                    type="text"
                    placeholder="Your name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                    disabled={isSubmitting}
                    autoFocus
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="Create a password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    required
                    disabled={isSubmitting}
                    minLength={8}
                  />
                  <p className="text-xs text-muted-foreground">Must be at least 8 characters</p>
                </div>

                <Button
                  type="submit"
                  className="w-full"
                  disabled={isSubmitting || !formData.name || !formData.password}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating account...
                    </>
                  ) : (
                    'Create Account & Join'
                  )}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // Unauthenticated without email in URL: Show error
  if (!user && !invitationVerification && !emailFromUrl) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <ErrorContent
          title="Invalid invitation link"
          icon={XCircle}
          showRetry={false}
          description="This invitation link is incomplete. Please ask the administrator to send you a new invitation link."
          link="/"
          linkText="Go home"
        />
      </div>
    );
  }

  // Authenticated: Show accept/decline buttons
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-none border-none bg-transparent space-y-3">
        <div className="px-6">
          <InkeepIcon size={48} />
        </div>
        <CardHeader>
          <CardTitle className="text-2xl font-medium tracking-tight text-foreground">
            {invitationVerification?.organizationName
              ? `Join ${invitationVerification.organizationName}`
              : 'Accept invitation'}
          </CardTitle>
          <CardDescription>
            {invitationVerification?.organizationName ? (
              <>
                You've been invited to join{' '}
                <span className="font-medium">{invitationVerification.organizationName}</span>.
              </>
            ) : (
              "You've been invited to join an organization."
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
            <Button
              onClick={handleAccept}
              disabled={isSubmitting || !invitation}
              className="flex-1"
            >
              {isSubmitting ? (
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
              disabled={isSubmitting || !invitation}
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
