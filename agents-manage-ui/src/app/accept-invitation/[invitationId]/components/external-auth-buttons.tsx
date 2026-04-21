import type { MethodOption } from '@inkeep/agents-core/auth/auth-types';
import { Globe, Loader2 } from 'lucide-react';
import { GoogleColorIcon } from '@/components/icons/google';
import { MicrosoftColorIcon } from '@/components/icons/microsoft';
import { Button } from '@/components/ui/button';

interface ExternalAuthButtonsProps {
  hasGoogle: boolean;
  googleClientId: string | undefined;
  hasMicrosoft: boolean;
  microsoftClientId: string | undefined;
  ssoMethods: MethodOption[];
  isSubmitting: boolean;
  onExternalSignIn: (method: 'social' | 'sso', identifier: string, fallbackError: string) => void;
}

export function ExternalAuthButtons({
  hasGoogle,
  googleClientId,
  hasMicrosoft,
  microsoftClientId,
  ssoMethods,
  isSubmitting,
  onExternalSignIn,
}: ExternalAuthButtonsProps) {
  return (
    <>
      {hasGoogle && googleClientId && (
        <Button
          variant="gray-outline"
          onClick={() => onExternalSignIn('social', 'google', 'Google sign in failed')}
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

      {hasMicrosoft && microsoftClientId && (
        <Button
          variant="gray-outline"
          onClick={() => onExternalSignIn('social', 'microsoft', 'Microsoft sign in failed')}
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
              <MicrosoftColorIcon aria-hidden />
              Continue with Microsoft
            </>
          )}
        </Button>
      )}

      {ssoMethods.map((sso) => (
        <Button
          key={sso.providerId}
          variant="gray-outline"
          onClick={() =>
            sso.providerId
              ? onExternalSignIn('sso', sso.providerId, 'SSO sign in failed')
              : undefined
          }
          disabled={isSubmitting || !sso.providerId}
          className="w-full"
        >
          {isSubmitting ? (
            <>
              <Loader2 aria-hidden className="mr-2 h-4 w-4 animate-spin" />
              Redirecting...
            </>
          ) : (
            <>
              <Globe aria-hidden />
              {sso.displayName ? `Continue with ${sso.displayName}` : 'Continue with SSO'}
            </>
          )}
        </Button>
      ))}
    </>
  );
}
