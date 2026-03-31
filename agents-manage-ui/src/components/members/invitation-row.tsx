import { useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { TableCell, TableRow } from '@/components/ui/table';
import { useAuthClient } from '@/contexts/auth-client';
import { InvitationActionsMenu } from './components/invitation-actions-menu';
import { MemberConfirmationModals } from './components/member-confirmation-modals';
import { useConfirmationModal } from './hooks/use-confirmation-modal';
import { getDisplayRole, type Invitation } from './types';

interface InvitationRowProps {
  invitation: Invitation;
  isOrgAdmin: boolean;
  onInvitationRevoked?: () => void;
}

export function InvitationRow({ invitation, isOrgAdmin, onInvitationRevoked }: InvitationRowProps) {
  const authClient = useAuthClient();
  const [revokingInvitation, setRevokingInvitation] = useState<string | null>(null);

  const revokeModal = useConfirmationModal<Invitation>({
    onConfirm: async (inv) => await handleRevokeInvitation(inv),
  });

  const handleRevokeInvitation = async (inv: Invitation) => {
    setRevokingInvitation(inv.id);
    try {
      const { error } = await authClient.organization.cancelInvitation({
        invitationId: inv.id,
      });

      if (error) {
        toast.error('Failed to revoke invitation', {
          description: error.message || 'An error occurred while revoking the invitation.',
        });
        return;
      }

      toast.success('Invitation revoked', {
        description: `Invitation to ${inv.email} has been revoked.`,
      });
      onInvitationRevoked?.();
    } catch (err) {
      toast.error('Failed to revoke invitation', {
        description: err instanceof Error ? err.message : 'An unexpected error occurred.',
      });
    } finally {
      setRevokingInvitation(null);
    }
  };

  return (
    <>
      <TableRow key={invitation.id} noHover className="bg-muted/30">
        <TableCell>
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="font-medium text-muted-foreground">{invitation.email}</span>
              <Badge
                variant="outline"
                className="h-5 px-1.5 text-[10px] gap-1 text-amber-600 dark:text-amber-400 border-amber-300 dark:border-amber-600"
              >
                Pending
              </Badge>
            </div>
          </div>
        </TableCell>
        <TableCell>
          <Badge variant="code" className="h-7 px-3 text-xs inline-flex items-center">
            {getDisplayRole(invitation.role)}
          </Badge>
        </TableCell>
        <TableCell />
        <TableCell className="text-right">
          <InvitationActionsMenu
            invitation={invitation}
            isOrgAdmin={isOrgAdmin}
            onRevokeInvitation={(inv) => revokeModal.openModal(inv)}
          />
        </TableCell>
      </TableRow>

      {/* Revoke confirmation scoped to this row only */}
      <MemberConfirmationModals
        deleteModal={{
          isOpen: false,
          data: null,
          isLoading: false,
          onClose: () => {},
          onConfirm: () => Promise.resolve(),
        }}
        roleChangeModal={{
          isOpen: false,
          data: null,
          isLoading: false,
          onClose: () => {},
          onConfirm: () => Promise.resolve(),
        }}
        revokeModal={{
          isOpen: revokeModal.isOpen,
          data: revokeModal.data,
          isLoading: revokingInvitation === revokeModal.data?.id,
          onClose: revokeModal.closeModal,
          onConfirm: revokeModal.handleConfirm,
        }}
      />
    </>
  );
}
