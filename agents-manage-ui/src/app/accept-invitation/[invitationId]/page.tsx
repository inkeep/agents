'use client';

import { Loader2, XCircle } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { use, useEffect, useState } from 'react';
import { ErrorContent } from '@/components/errors/full-page-error';
import { Card, CardContent } from '@/components/ui/card';
import { useAuthClient } from '@/contexts/auth-client';
import { useRuntimeConfig } from '@/contexts/runtime-config';
import { useAuthSession } from '@/hooks/use-auth';
import { type InvitationVerification, verifyInvitation } from '@/lib/actions/invitations';
import { updateUserProfileTimezone } from '@/lib/actions/user-profile';
import { getSafeReturnUrl, isValidReturnUrl } from '@/lib/utils/auth-redirect';
import { AcceptDecline } from './components/accept-decline';
import { AuthMethodPicker } from './components/auth-method-picker';
import { InvitationSuccess } from './components/invitation-success';

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
  const { PUBLIC_GOOGLE_CLIENT_ID, PUBLIC_IS_SMTP_CONFIGURED } = useRuntimeConfig();

  const [invitationVerification, setInvitationVerification] =
    useState<InvitationVerification | null>(null);
  const [invitation, setInvitation] = useState<typeof authClient.$Infer.Invitation | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function getFullCallbackURL() {
    const baseURL = window.location.origin;
    const params = new URLSearchParams();
    params.set('invitation', invitationId);
    if (returnUrl && isValidReturnUrl(returnUrl)) {
      params.set('returnUrl', returnUrl);
    }
    return `${baseURL}/?${params.toString()}`;
  }

  // Redirect after successful acceptance
  function onSuccess(orgId?: string) {
    setSuccess(true);
    setTimeout(() => {
      router.push(getSafeReturnUrl(returnUrl, orgId ? `/${orgId}/projects` : '/'));
    }, 2000);
  }

  // Accept invitation + set org active (shared by all auth flows)
  async function acceptAndActivate(orgId?: string) {
    const acceptResult = await authClient.organization.acceptInvitation({ invitationId });
    if ('error' in acceptResult && acceptResult.error) {
      throw new Error(acceptResult.error.message || 'Failed to accept invitation');
    }
    const resolvedOrgId =
      orgId ??
      (acceptResult.data as { organizationId?: string })?.organizationId ??
      invitation?.organizationId;
    if (resolvedOrgId) {
      await authClient.organization.setActive({ organizationId: resolvedOrgId });
    }
    onSuccess(resolvedOrgId);
  }

  // --- Data fetching ---

  // Unauthenticated: verify invitation
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
      }
      setIsLoading(false);
    }

    if (!user && !isAuthLoading) {
      fetchInvitationVerification();
    }
  }, [invitationId, emailFromUrl, user, isAuthLoading]);

  // Authenticated: fetch full invitation
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
      }
      setIsLoading(false);
    }

    if (user) {
      fetchInvitation();
    }
  }, [invitationId, user, authClient, isSubmitting, success]);

  // --- Handlers ---

  const handleSignup = async (name: string, password: string) => {
    if (!invitationVerification || !emailFromUrl) return;
    setIsSubmitting(true);
    setError(null);

    try {
      const signupResult = await authClient.signUp.email({
        email: emailFromUrl,
        password,
        name,
      });
      if (signupResult?.error) {
        setError(signupResult.error.message || 'Failed to create account');
        setIsSubmitting(false);
        return;
      }

      const newUserId = signupResult.data?.user?.id;
      if (newUserId) {
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        try {
          await updateUserProfileTimezone(newUserId, timezone);
        } catch {
          // Best-effort
        }
      }

      await acceptAndActivate(invitationVerification.organizationId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create account');
      setIsSubmitting(false);
    }
  };

  const handleLogin = async (password: string) => {
    if (!invitationVerification || !emailFromUrl) return;
    setIsSubmitting(true);
    setError(null);

    try {
      const signinResult = await authClient.signIn.email({
        email: emailFromUrl,
        password,
      });
      if (signinResult?.error) {
        setError(signinResult.error.message || 'Failed to sign in');
        setIsSubmitting(false);
        return;
      }

      await acceptAndActivate(invitationVerification.organizationId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sign in');
      setIsSubmitting(false);
    }
  };

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
      setError(err instanceof Error ? err.message : fallbackError);
      setIsSubmitting(false);
    }
  };

  const handleAccept = async () => {
    if (!user) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await acceptAndActivate();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to accept invitation');
      setIsSubmitting(false);
    }
  };

  const handleReject = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      await authClient.organization.rejectInvitation({ invitationId });
      router.push('/');
    } catch {
      setError('Failed to reject invitation');
      setIsSubmitting(false);
    }
  };

  // --- Render ---

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

  if (success) {
    return <InvitationSuccess />;
  }

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

  // Unauthenticated with verification: show auth methods
  if (!user && invitationVerification && emailFromUrl) {
    return (
      <AuthMethodPicker
        invitationVerification={invitationVerification}
        email={emailFromUrl}
        googleClientId={PUBLIC_GOOGLE_CLIENT_ID}
        isSmtpConfigured={!!PUBLIC_IS_SMTP_CONFIGURED}
        isSubmitting={isSubmitting}
        error={error}
        onSignup={handleSignup}
        onLogin={handleLogin}
        onExternalSignIn={handleExternalSignIn}
      />
    );
  }

  // Authenticated: accept/decline
  return (
    <AcceptDecline
      invitationVerification={invitationVerification}
      hasInvitation={!!invitation}
      isSubmitting={isSubmitting}
      error={error}
      onAccept={handleAccept}
      onReject={handleReject}
    />
  );
}
