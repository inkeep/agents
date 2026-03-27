import { type OrgRole, OrgRoles } from '@inkeep/agents-core/client-exports';
import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { ChangePasswordDialog } from '@/components/members/change-password-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { TableCell, TableRow } from '@/components/ui/table';
import { useAuthClient } from '@/contexts/auth-client';
import { createPasswordResetLink } from '@/lib/actions/password-reset';
import type { UserProvider } from '@/lib/actions/user-accounts';
import { MemberActionsMenu } from './components/member-actions-menu';
import { MemberConfirmationModals } from './components/member-confirmation-modals';
import { useConfirmationModal } from './hooks/use-confirmation-modal';
import { ProjectAccessDialog } from './project-access-dialog';
import { getDisplayRole, type Member, ROLE_OPTIONS } from './types';

interface MemberRowProps {
  member: Member;
  currentMember: Member | null;
  organizationId: string;
  isOrgAdmin: boolean;
  memberProviders: UserProvider[];
  onMemberUpdated?: () => void;
}

export function MemberRow({
  member,
  currentMember,
  organizationId,
  isOrgAdmin,
  memberProviders,
  onMemberUpdated,
}: MemberRowProps) {
  const authClient = useAuthClient();
  const { id, user, role } = member;

  const [changePasswordDialogOpen, setChangePasswordDialogOpen] = useState(false);
  const [updatingMemberId, setUpdatingMemberId] = useState<string | null>(null);
  const [resettingMemberId, setResettingMemberId] = useState<string | null>(null);
  const [deletingMemberId, setDeletingMemberId] = useState<string | null>(null);
  const [projectAccessDialogOpen, setProjectAccessDialogOpen] = useState(false);
  const [projectAccessMode, setProjectAccessMode] = useState<'assign' | 'manage'>('manage');

  const isCurrentUser = currentMember?.id === id;
  const isUpdating = updatingMemberId === id;

  const deleteModal = useConfirmationModal<Member>({
    onConfirm: async (m) => await handleDeleteMember(m),
  });

  const roleChangeModal = useConfirmationModal<{ member: Member; newRole: OrgRole }>({
    onConfirm: async ({ member: m, newRole }) => await performRoleChange(m.id, m, newRole),
  });

  const isAdminOrOwner = (r: string | null) => r === OrgRoles.ADMIN || r === OrgRoles.OWNER;

  const canEditMember = (): boolean => {
    if (!isOrgAdmin || !currentMember) return false;
    if (member.id === currentMember.id) return false;
    if (currentMember.role === OrgRoles.ADMIN && member.role === OrgRoles.OWNER) return false;
    return true;
  };

  const handleRoleChange = (newRole: OrgRole) => {
    if (!isOrgAdmin || member.role === newRole) return;
    roleChangeModal.openModal({ member, newRole });
  };

  const performRoleChange = async (memberId: string, m: Member, newRole: OrgRole) => {
    const isDemotion =
      (m.role === OrgRoles.ADMIN || m.role === OrgRoles.OWNER) && newRole === OrgRoles.MEMBER;

    setUpdatingMemberId(memberId);
    try {
      const { error } = await authClient.organization.updateMemberRole({
        memberId,
        role: newRole,
        organizationId,
      });

      if (error) {
        toast.error('Failed to update role', {
          description: error.message || 'An error occurred while updating the role.',
        });
        return;
      }

      toast.success('Role updated', {
        description: `Member role has been changed to ${getDisplayRole(newRole)}.`,
      });

      if (isDemotion) {
        setProjectAccessMode('assign');
        setProjectAccessDialogOpen(true);
      } else {
        onMemberUpdated?.();
      }
    } catch (err) {
      toast.error('Failed to update role', {
        description: err instanceof Error ? err.message : 'An unexpected error occurred.',
      });
    } finally {
      setUpdatingMemberId(null);
    }
  };

  const handleResetPassword = async (member: Member) => {
    if (!isOrgAdmin) return;
    if (!member.user?.email) return;
    if (member.id === currentMember?.id) return;

    setResettingMemberId(member.id);
    try {
      const result = await createPasswordResetLink({
        tenantId: organizationId,
        email: member.user.email,
      });
      await navigator.clipboard.writeText(result.url);
      toast.success('Reset link copied to clipboard', {
        description: 'Share the reset password link with the user.',
        duration: 6000,
      });
    } catch (err) {
      toast.error('Failed to create reset link', {
        description: err instanceof Error ? err.message : 'An unexpected error occurred.',
      });
    } finally {
      setResettingMemberId(null);
    }
  };

  const handleDeleteMember = async (m: Member) => {
    if (!isOrgAdmin || m.id === currentMember?.id || m.role === OrgRoles.OWNER) return;

    setDeletingMemberId(m.id);
    try {
      const { error } = await authClient.organization.removeMember({
        memberIdOrEmail: m.id,
        organizationId,
      });

      if (error) {
        toast.error('Failed to delete member', {
          description: error.message || 'An error occurred while deleting the member.',
        });
        return;
      }

      toast.success('Member deleted', {
        description: `${m.user.name || m.user.email} has been removed from the organization.`,
      });

      onMemberUpdated?.();
    } catch (err) {
      toast.error('Failed to delete member', {
        description: err instanceof Error ? err.message : 'An unexpected error occurred.',
      });
    } finally {
      setDeletingMemberId(null);
    }
  };

  const handleProjectAccessComplete = () => {
    setProjectAccessDialogOpen(false);
    onMemberUpdated?.();
  };

  return (
    <>
      <TableRow key={id} noHover>
        <TableCell>
          <div className="flex flex-col">
            <span className="font-medium text-foreground">
              {user.name || user.email}
              {isCurrentUser && <span className="ml-2 text-xs text-muted-foreground">(you)</span>}
            </span>
            <span className="text-sm text-muted-foreground">{user.email}</span>
          </div>
        </TableCell>
        <TableCell>
          {canEditMember() ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1 normal-case text-xs h-7"
                  disabled={isUpdating}
                >
                  {getDisplayRole(role)}
                  <ChevronDown className="size-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {ROLE_OPTIONS.map((r) => (
                  <DropdownMenuItem
                    key={r.value}
                    onClick={() => handleRoleChange(r.value)}
                    className={role === r.value ? 'bg-muted' : ''}
                  >
                    <div className="flex flex-col">
                      <span>{r.label}</span>
                      <span className="text-xs text-muted-foreground">{r.description}</span>
                    </div>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            role && (
              <Badge variant="code" className="h-7 px-3 text-xs inline-flex items-center">
                {getDisplayRole(role)}
              </Badge>
            )
          )}
        </TableCell>
        <TableCell>
          {isAdminOrOwner(role) ? (
            <Badge variant="code" className="h-7 px-3 text-xs inline-flex items-center">
              All projects
            </Badge>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-xs h-7 normal-case"
              onClick={() => {
                setProjectAccessMode('manage');
                setProjectAccessDialogOpen(true);
              }}
            >
              {isOrgAdmin ? 'Manage' : 'View'}
            </Button>
          )}
        </TableCell>
        <TableCell className="text-right">
          <MemberActionsMenu
            member={member}
            currentMember={currentMember}
            isOrgAdmin={isOrgAdmin}
            memberProviders={memberProviders}
            onResetPassword={handleResetPassword}
            onChangePassword={() => setChangePasswordDialogOpen(true)}
            onDeleteMember={(m) => deleteModal.openModal(m)}
            resettingMemberId={resettingMemberId}
            deletingMemberId={deletingMemberId}
          />
        </TableCell>
      </TableRow>

      {/* All dialogs scoped to this row only */}
      <ChangePasswordDialog
        open={changePasswordDialogOpen}
        onOpenChange={setChangePasswordDialogOpen}
      />

      <ProjectAccessDialog
        open={projectAccessDialogOpen}
        onOpenChange={setProjectAccessDialogOpen}
        tenantId={organizationId}
        userId={user.id}
        userName={user.name || user.email}
        mode={projectAccessMode}
        readOnly={!isOrgAdmin}
        onComplete={handleProjectAccessComplete}
      />

      <MemberConfirmationModals
        deleteModal={{
          isOpen: deleteModal.isOpen,
          data: deleteModal.data,
          isLoading: deletingMemberId === deleteModal.data?.id,
          onClose: deleteModal.closeModal,
          onConfirm: deleteModal.handleConfirm,
        }}
        roleChangeModal={{
          isOpen: roleChangeModal.isOpen,
          data: roleChangeModal.data,
          isLoading: updatingMemberId === roleChangeModal.data?.member.id,
          onClose: roleChangeModal.closeModal,
          onConfirm: roleChangeModal.handleConfirm,
        }}
        revokeModal={{
          isOpen: false,
          data: null,
          isLoading: false,
          onClose: () => {},
          onConfirm: () => Promise.resolve(),
        }}
      />
    </>
  );
}
