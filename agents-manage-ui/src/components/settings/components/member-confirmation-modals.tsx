import type { OrgRole } from '@inkeep/agents-core/client-exports';
import { ConfirmationModal } from '@/components/ui/confirmation-modal';
import type { useAuthClient } from '@/contexts/auth-client';

type AuthClient = ReturnType<typeof useAuthClient>;
type Member = AuthClient['$Infer']['Member'];
type Invitation = AuthClient['$Infer']['Invitation'];

interface MemberConfirmationModalsProps {
  // Delete modal
  deleteModal: {
    isOpen: boolean;
    data: Member | null;
    isLoading: boolean;
    onClose: () => void;
    onConfirm: () => Promise<void>;
  };
  // Role change modal
  roleChangeModal: {
    isOpen: boolean;
    data: { member: Member; newRole: OrgRole } | null;
    isLoading: boolean;
    onClose: () => void;
    onConfirm: () => Promise<void>;
  };
  // Revoke invitation modal
  revokeModal: {
    isOpen: boolean;
    data: Invitation | null;
    isLoading: boolean;
    onClose: () => void;
    onConfirm: () => Promise<void>;
  };
}

const getDisplayRole = (role: string | null): string => {
  if (!role) return '';
  if (role === 'owner') return 'Owner';
  return role.charAt(0).toUpperCase() + role.slice(1);
};

export function MemberConfirmationModals({
  deleteModal,
  roleChangeModal,
  revokeModal,
}: MemberConfirmationModalsProps) {
  return (
    <>
      {/* Delete Member Confirmation */}
      <ConfirmationModal
        open={deleteModal.isOpen}
        onOpenChange={(open) => !open && deleteModal.onClose()}
        title="Delete Member"
        description={`Are you sure you want to delete ${deleteModal.data?.user.name || deleteModal.data?.user.email}? This will permanently remove them from the organization and revoke their access to all projects.`}
        confirmText="Delete Member"
        variant="danger"
        onConfirm={deleteModal.onConfirm}
        isLoading={deleteModal.isLoading}
      />

      {/* Role Change Confirmation */}
      <ConfirmationModal
        open={roleChangeModal.isOpen}
        onOpenChange={(open) => !open && roleChangeModal.onClose()}
        title="Change Member Role"
        description={`Are you sure you want to change ${roleChangeModal.data?.member.user.name || roleChangeModal.data?.member.user.email}'s role to ${getDisplayRole(roleChangeModal.data?.newRole || '')}?`}
        confirmText="Change Role"
        variant="warning"
        onConfirm={roleChangeModal.onConfirm}
        isLoading={roleChangeModal.isLoading}
      />

      {/* Revoke Invitation Confirmation */}
      <ConfirmationModal
        open={revokeModal.isOpen}
        onOpenChange={(open) => !open && revokeModal.onClose()}
        title="Revoke Invitation"
        description={`Are you sure you want to revoke the invitation to ${revokeModal.data?.email}? They will no longer be able to accept it. You can send a new invitation if needed.`}
        confirmText="Revoke Invitation"
        variant="danger"
        onConfirm={revokeModal.onConfirm}
        isLoading={revokeModal.isLoading}
      />
    </>
  );
}
