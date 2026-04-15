import type { InvitationVerification } from '@/lib/actions/invitations';
import { ExternalAuthButtons } from './external-auth-buttons';
import { InvitationLayout } from './invitation-layout';
import { LoginForm } from './login-form';
import { SignupForm } from './signup-form';

interface AuthMethodPickerProps {
  invitationVerification: InvitationVerification;
  email: string;
  googleClientId: string | undefined;
  microsoftClientId: string | undefined;
  isSmtpConfigured: boolean;
  isSubmitting: boolean;
  error: string | null;
  onSignup: (name: string, password: string) => void;
  onLogin: (password: string) => void;
  onExternalSignIn: (method: 'social' | 'sso', identifier: string, fallbackError: string) => void;
}

export function AuthMethodPicker({
  invitationVerification,
  email,
  googleClientId,
  microsoftClientId,
  isSmtpConfigured,
  isSubmitting,
  error,
  onSignup,
  onLogin,
  onExternalSignIn,
}: AuthMethodPickerProps) {
  const orgName = invitationVerification.organizationName;
  const allowedMethods = invitationVerification.allowedAuthMethods ?? [];
  const hasGoogle = allowedMethods.some((m) => m.method === 'google');
  const hasMicrosoft = allowedMethods.some((m) => m.method === 'microsoft');
  const ssoMethods = allowedMethods.filter((m) => m.method === 'sso');
  const hasEmailPassword = allowedMethods.some((m) => m.method === 'email-password');
  const hasExternalMethods = hasGoogle || hasMicrosoft || ssoMethods.length > 0;
  const hasNoMethods = !hasGoogle && !hasMicrosoft && ssoMethods.length === 0 && !hasEmailPassword;

  const description = hasNoMethods ? (
    <>
      No sign-in methods are available for your email domain. Contact the administrator of{' '}
      <span className="font-medium">{orgName ?? 'the organization'}</span> for help.
    </>
  ) : invitationVerification.userExists ? (
    <>
      You've been invited to join{' '}
      <span className="font-medium">{orgName ?? 'an organization'}</span>. Sign in to accept.
    </>
  ) : orgName ? (
    <>
      You've been invited to join <span className="font-medium">{orgName}</span>. Choose how you'd
      like to sign in.
    </>
  ) : (
    <>You've been invited to join an organization. Choose how you'd like to sign in.</>
  );

  return (
    <InvitationLayout
      title={orgName ? `Join ${orgName}` : 'Accept invitation'}
      description={description}
      error={error}
    >
      <ExternalAuthButtons
        hasGoogle={hasGoogle}
        googleClientId={googleClientId}
        hasMicrosoft={hasMicrosoft}
        microsoftClientId={microsoftClientId}
        ssoMethods={ssoMethods}
        isSubmitting={isSubmitting}
        onExternalSignIn={onExternalSignIn}
      />

      {hasExternalMethods && hasEmailPassword && (
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground">or</span>
          </div>
        </div>
      )}

      {hasEmailPassword && invitationVerification.userExists && (
        <LoginForm
          email={email}
          isSubmitting={isSubmitting}
          showForgotPassword={!!isSmtpConfigured}
          onSubmit={onLogin}
        />
      )}

      {hasEmailPassword && !invitationVerification.userExists && (
        <SignupForm email={email} isSubmitting={isSubmitting} onSubmit={onSignup} />
      )}
    </InvitationLayout>
  );
}
