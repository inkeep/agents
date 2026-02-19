import { Copy, Info, MoreVertical, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

type AuthClient = any; // Replace with proper type
type Invitation = AuthClient['$Infer']['Invitation'];

interface InvitationActionsMenuProps {
  invitation: Invitation;
  isOrgAdmin: boolean;
  onRevokeInvitation: (invitation: Invitation) => void;
}

export function InvitationActionsMenu({
  invitation,
  isOrgAdmin,
  onRevokeInvitation,
}: InvitationActionsMenuProps) {
  const handleCopyInviteLink = () => {
    const link = `${window.location.origin}/accept-invitation/${invitation.id}?email=${encodeURIComponent(invitation.email)}`;
    navigator.clipboard.writeText(link);
    toast.success('Invite link copied');
  };

  if (!isOrgAdmin) {
    return null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          aria-label="Open actions menu"
        >
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {invitation.authMethod === 'email-password' ? (
          <DropdownMenuItem onClick={handleCopyInviteLink}>
            <Copy className="h-4 w-4" />
            Copy invite link
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem disabled className="text-muted-foreground">
            <Info className="h-4 w-4" />
            Sign in via {invitation.authMethod === 'google' ? 'Google' : 'Inkeep SSO'}
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={() => onRevokeInvitation(invitation)} variant="destructive">
          <XCircle className="h-4 w-4" />
          Revoke invite
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
