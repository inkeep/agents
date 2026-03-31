import { AlertCircleIcon, Loader2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import type { InvitationVerification } from '@/lib/actions/invitations';
import { InvitationLayout } from './invitation-layout';

interface AcceptDeclineProps {
  invitationVerification: InvitationVerification | null;
  hasInvitation: boolean;
  isSubmitting: boolean;
  error: string | null;
  onAccept: () => void;
  onReject: () => void;
}

export function AcceptDecline({
  invitationVerification,
  hasInvitation,
  isSubmitting,
  error,
  onAccept,
  onReject,
}: AcceptDeclineProps) {
  const orgName = invitationVerification?.organizationName;
  const seatLimitReached = invitationVerification?.seatLimitReached;

  return (
    <InvitationLayout
      title={orgName ? `Join ${orgName}` : 'Accept invitation'}
      description={
        orgName ? (
          <>
            You've been invited to join <span className="font-medium">{orgName}</span>.
          </>
        ) : (
          "You've been invited to join an organization."
        )
      }
      error={error}
    >
      {seatLimitReached && !error && (
        <Alert className="border-border">
          <AlertCircleIcon aria-hidden className="h-4 w-4" />
          <AlertDescription>
            {seatLimitReached}. Contact your organization admin to increase the limit.
          </AlertDescription>
        </Alert>
      )}

      <div className="flex gap-3">
        <Button
          onClick={onAccept}
          disabled={isSubmitting || !hasInvitation || !!seatLimitReached}
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
          onClick={onReject}
          variant="outline"
          disabled={isSubmitting || !hasInvitation}
          className="flex-1"
        >
          Decline
        </Button>
      </div>
    </InvitationLayout>
  );
}
