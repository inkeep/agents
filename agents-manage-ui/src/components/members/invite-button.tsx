import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../ui/button';
import { InviteMemberDialog } from './invite-member-dialog';

interface InviteButtonProps {
  isOrgAdmin: boolean;
  onInvitationsSent?: () => void;
}

export function InviteButton({ isOrgAdmin, onInvitationsSent }: InviteButtonProps) {
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setInviteDialogOpen(true)} size="sm" variant="outline">
        <Plus />
        Add
      </Button>
      <InviteMemberDialog
        open={inviteDialogOpen}
        onOpenChange={setInviteDialogOpen}
        isOrgAdmin={isOrgAdmin}
        onInvitationsSent={onInvitationsSent}
      />
    </>
  );
}
