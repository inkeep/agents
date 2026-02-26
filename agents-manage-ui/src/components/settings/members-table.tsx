import { type OrgRole, OrgRoles } from '@inkeep/agents-core/client-exports';
import { ChevronDown, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ChangePasswordDialog } from '@/components/settings/change-password-dialog';
import { InviteMemberDialog } from '@/components/settings/invite-member-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAuthClient } from '@/contexts/auth-client';
import { createPasswordResetLink } from '@/lib/actions/password-reset';
import type { UserProvider } from '@/lib/actions/user-accounts';
import { InvitationActionsMenu } from './components/invitation-actions-menu';
import { MemberActionsMenu } from './components/member-actions-menu';
import { MemberConfirmationModals } from './components/member-confirmation-modals';
import { useConfirmationModal } from './hooks/use-confirmation-modal';
import { ProjectAccessDialog } from './project-access-dialog';

type AuthClient = ReturnType<typeof useAuthClient>;
type Member = AuthClient['$Infer']['Member'];
type Invitation = AuthClient['$Infer']['Invitation'];

interface RoleOption {
  value: OrgRole;
  label: string;
  description: string;
}

const ROLE_OPTIONS: RoleOption[] = [
  {
    value: OrgRoles.ADMIN,
    label: 'Admin',
    description: 'Full access to manage organization settings and members',
  },
  {
    value: OrgRoles.MEMBER,
    label: 'Member',
    description: 'Must be added to projects individually with a project role',
  },
];

const getDisplayRole = (role: string | null): string => {
  if (!role) return '';
  if (role === OrgRoles.OWNER) return 'Owner';
  const roleOption = ROLE_OPTIONS.find((r) => r.value === role);
  return roleOption?.label || role.charAt(0).toUpperCase() + role.slice(1);
};

interface MembersTableProps {
  members: Member[];
  pendingInvitations?: Invitation[];
  currentMember: Member | null;
  organizationId: string;
  onMemberUpdated?: () => void;
  isOrgAdmin: boolean;
  memberProviders?: UserProvider[];
}

export function MembersTable({
  members,
  pendingInvitations = [],
  currentMember,
  organizationId,
  onMemberUpdated,
  isOrgAdmin,
  memberProviders = [],
}: MembersTableProps) {
  const authClient = useAuthClient();
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [changePasswordDialogOpen, setChangePasswordDialogOpen] = useState(false);
  const [updatingMemberId, setUpdatingMemberId] = useState<string | null>(null);
  const [resettingMemberId, setResettingMemberId] = useState<string | null>(null);
  const [deletingMemberId, setDeletingMemberId] = useState<string | null>(null);
  const [revokingInvitation, setRevokingInvitation] = useState<string | null>(null);

  // State for the project access dialog
  const [projectAccessDialogOpen, setProjectAccessDialogOpen] = useState(false);
  const [projectAccessMode, setProjectAccessMode] = useState<'assign' | 'manage'>('assign');
  const [selectedUser, setSelectedUser] = useState<{ userId: string; userName: string } | null>(
    null
  );

  // Confirmation modals using reusable hook
  const deleteModal = useConfirmationModal<Member>({
    onConfirm: async (member) => {
      await handleDeleteMember(member);
    },
  });

  const roleChangeModal = useConfirmationModal<{ member: Member; newRole: OrgRole }>({
    onConfirm: async ({ member, newRole }) => {
      await performRoleChange(member.id, member, newRole);
    },
  });

  const revokeModal = useConfirmationModal<Invitation>({
    onConfirm: async (invitation) => {
      await handleRevokeInvitation(invitation);
    },
  });

  // Sort members alphabetically by name (A→Z)
  const sortedMembers = useMemo(() => {
    return [...members].sort((a, b) => {
      const nameA = (a.user.name || a.user.email).toLowerCase();
      const nameB = (b.user.name || b.user.email).toLowerCase();
      return nameA.localeCompare(nameB);
    });
  }, [members]);

  const handleRoleChange = async (member: Member, newRole: OrgRole) => {
    if (!isOrgAdmin) return;

    if (member.role === newRole) return;

    // Always show confirmation modal for any role change
    roleChangeModal.openModal({ member, newRole });
  };

  const performRoleChange = async (memberId: string, member: Member, newRole: OrgRole) => {
    const isDemotion =
      (member.role === OrgRoles.ADMIN || member.role === OrgRoles.OWNER) &&
      newRole === OrgRoles.MEMBER;

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

      // If this was a demotion, show the project access dialog in assign mode
      // Note: When promoting to admin, project memberships are automatically cleaned up
      // in the beforeUpdateMemberRole hook (admins have inherited access to all projects)
      if (isDemotion) {
        setSelectedUser({
          userId: member.user.id,
          userName: member.user.name || member.user.email,
        });
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

  const handleProjectAccessComplete = () => {
    setSelectedUser(null);
    onMemberUpdated?.();
  };

  const openManageProjectAccess = (member: Member) => {
    setSelectedUser({
      userId: member.user.id,
      userName: member.user.name || member.user.email,
    });
    setProjectAccessMode('manage');
    setProjectAccessDialogOpen(true);
  };

  const isAdminOrOwner = (role: string | null) =>
    role === OrgRoles.ADMIN || role === OrgRoles.OWNER;

  const canEditMember = (member: Member): boolean => {
    if (!isOrgAdmin || !currentMember) return false;
    if (member.id === currentMember.id) return false;
    if (currentMember.role === OrgRoles.ADMIN && member.role === OrgRoles.OWNER) return false;
    return true;
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

  const handleRevokeInvitation = async (invitation: Invitation) => {
    setRevokingInvitation(invitation.id);
    try {
      const { error } = await authClient.organization.cancelInvitation({
        invitationId: invitation.id,
      });

      if (error) {
        toast.error('Failed to revoke invitation', {
          description: error.message || 'An error occurred while revoking the invitation.',
        });
        return;
      }

      toast.success('Invitation revoked', {
        description: `Invitation to ${invitation.email} has been revoked.`,
      });
      onMemberUpdated?.();
    } catch (err) {
      toast.error('Failed to revoke invitation', {
        description: err instanceof Error ? err.message : 'An unexpected error occurred.',
      });
    } finally {
      setRevokingInvitation(null);
    }
  };

  const handleDeleteMember = async (member: Member) => {
    if (!isOrgAdmin) return;
    if (member.id === currentMember?.id) return;
    if (member.role === OrgRoles.OWNER) return;

    setDeletingMemberId(member.id);
    try {
      const { error } = await authClient.organization.removeMember({
        memberIdOrEmail: member.id,
        organizationId,
      });

      if (error) {
        toast.error('Failed to delete member', {
          description: error.message || 'An error occurred while deleting the member.',
        });
        return;
      }

      toast.success('Member deleted', {
        description: `${member.user.name || member.user.email} has been removed from the organization.`,
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

  return (
    <div>
      <div className="rounded-lg border">
        <div className="flex items-center justify-between px-4 py-4">
          <div className="flex items-center gap-2">
            <h2 className="text-md font-medium text-gray-700 dark:text-white/70">Members</h2>
            <Badge variant="count">{members.length}</Badge>
          </div>
          {isOrgAdmin && (
            <Button onClick={() => setInviteDialogOpen(true)} size="sm" variant="outline">
              <Plus />
              Add
            </Button>
          )}
        </div>
        <Table>
          <TableHeader>
            <TableRow noHover>
              <TableHead>Name</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Project Access</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.length === 0 && pendingInvitations.length === 0 ? (
              <TableRow noHover>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  No members yet.
                </TableCell>
              </TableRow>
            ) : (
              <>
                {sortedMembers.map((member: Member) => {
                  const { id, user, role } = member;
                  const isCurrentUser = currentMember?.id === id;
                  const isEditable = canEditMember(member);
                  const isUpdating = updatingMemberId === id;
                  return (
                    <TableRow key={id} noHover>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium text-foreground">
                            {user.name || user.email}
                            {isCurrentUser && (
                              <span className="ml-2 text-xs text-muted-foreground">(you)</span>
                            )}
                          </span>
                          <span className="text-sm text-muted-foreground">{user.email}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {isEditable ? (
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
                                  onClick={() => handleRoleChange(member, r.value)}
                                  className={role === r.value ? 'bg-muted' : ''}
                                >
                                  <div className="flex flex-col">
                                    <span>{r.label}</span>
                                    <span className="text-xs text-muted-foreground">
                                      {r.description}
                                    </span>
                                  </div>
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        ) : (
                          role && (
                            <Badge
                              variant="code"
                              className="h-7 px-3 text-xs inline-flex items-center"
                            >
                              {getDisplayRole(role)}
                            </Badge>
                          )
                        )}
                      </TableCell>
                      <TableCell>
                        {isAdminOrOwner(role) ? (
                          <Badge
                            variant="code"
                            className="h-7 px-3 text-xs inline-flex items-center"
                          >
                            All projects
                          </Badge>
                        ) : (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="text-xs h-7 normal-case"
                            onClick={() => openManageProjectAccess(member)}
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
                          onDeleteMember={(member) => deleteModal.openModal(member)}
                          resettingMemberId={resettingMemberId}
                          deletingMemberId={deletingMemberId}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
                {pendingInvitations.map((invitation) => (
                  <TableRow key={invitation.id} noHover className="bg-muted/30">
                    <TableCell>
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-muted-foreground">
                            {invitation.email}
                          </span>
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
                        onRevokeInvitation={(invitation) => revokeModal.openModal(invitation)}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </>
            )}
          </TableBody>
        </Table>
      </div>

      <InviteMemberDialog
        open={inviteDialogOpen}
        onOpenChange={setInviteDialogOpen}
        isOrgAdmin={isOrgAdmin}
        onInvitationsSent={onMemberUpdated}
      />

      <ChangePasswordDialog
        open={changePasswordDialogOpen}
        onOpenChange={setChangePasswordDialogOpen}
      />

      {selectedUser && (
        <ProjectAccessDialog
          open={projectAccessDialogOpen}
          onOpenChange={setProjectAccessDialogOpen}
          tenantId={organizationId}
          userId={selectedUser.userId}
          userName={selectedUser.userName}
          mode={projectAccessMode}
          readOnly={!isOrgAdmin}
          onComplete={handleProjectAccessComplete}
        />
      )}

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
          isOpen: revokeModal.isOpen,
          data: revokeModal.data,
          isLoading: revokingInvitation === revokeModal.data?.id,
          onClose: revokeModal.closeModal,
          onConfirm: revokeModal.handleConfirm,
        }}
      />
    </div>
  );
}
