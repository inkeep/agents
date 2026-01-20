import { type OrgRole, OrgRoles } from '@inkeep/agents-core/client-exports';
import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { InviteMemberDialog } from '@/components/auth/invite-member-dialog';
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
import { type useAuthClient as UseAuthClientType, useAuthClient } from '@/contexts/auth-client';
import { useRuntimeConfig } from '@/contexts/runtime-config';
import { AssignProjectsDialog } from './assign-projects-dialog';

type FullOrganization = NonNullable<
  Awaited<
    ReturnType<ReturnType<typeof UseAuthClientType>['organization']['getFullOrganization']>
  >['data']
>;

type Member = FullOrganization['members'][number];

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
  if (role === OrgRoles.OWNER) return 'Admin';
  const roleOption = ROLE_OPTIONS.find((r) => r.value === role);
  return roleOption?.label || role.charAt(0).toUpperCase() + role.slice(1);
};

interface MembersTableProps {
  members: FullOrganization['members'];
  currentMember: Member | null;
  organizationId: string;
  onMemberUpdated?: () => void;
}

export function MembersTable({
  members,
  currentMember,
  organizationId,
  onMemberUpdated,
}: MembersTableProps) {
  const authClient = useAuthClient();
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [updatingMemberId, setUpdatingMemberId] = useState<string | null>(null);

  // State for the assign projects dialog (shown after demotion)
  const [assignProjectsDialogOpen, setAssignProjectsDialogOpen] = useState(false);
  const [demotedUser, setDemotedUser] = useState<{ userId: string; userName: string } | null>(null);

  const canEditRoles =
    currentMember?.role === OrgRoles.OWNER || currentMember?.role === OrgRoles.ADMIN;

  const handleRoleChange = async (memberId: string, member: Member, newRole: OrgRole) => {
    if (!canEditRoles) return;

    const oldRole = (member.role === OrgRoles.OWNER ? OrgRoles.ADMIN : member.role) as OrgRole;
    if (oldRole === newRole) return;

    const isDemotion = oldRole === OrgRoles.ADMIN && newRole === OrgRoles.MEMBER;

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

      // If this was a demotion, show the assign projects dialog
      // Note: When promoting to admin, project memberships are automatically cleaned up
      // in the beforeUpdateMemberRole hook (admins have inherited access to all projects)
      if (isDemotion) {
        setDemotedUser({
          userId: member.user.id,
          userName: member.user.name || member.user.email,
        });
        setAssignProjectsDialogOpen(true);
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

  const handleAssignProjectsComplete = () => {
    setDemotedUser(null);
    onMemberUpdated?.();
  };

  const canEditMember = (member: Member): boolean => {
    if (organizationId !== 'default') return false;
    if (!canEditRoles || !currentMember) return false;
    if (member.id === currentMember.id) return false;
    if (currentMember.role === OrgRoles.ADMIN && member.role === OrgRoles.OWNER) return false;
    return true;
  };

  return (
    <div>
      <div className="rounded-lg border">
        <div className="flex items-center justify-between px-4 py-4">
          <div className="flex items-center gap-2">
            <h2 className="text-md font-medium text-gray-700 dark:text-white/70">Members</h2>
            <Badge variant="count">{members.length}</Badge>
          </div>
          {/* <Button onClick={() => setInviteDialogOpen(true)} size="sm" variant="outline">
            <UserPlus className="h-4 w-4 mr-2" />
            Invite
          </Button> */}
        </div>
        <Table>
          <TableHeader>
            <TableRow noHover>
              <TableHead>Name</TableHead>
              <TableHead>Role</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.length === 0 ? (
              <TableRow noHover>
                <TableCell colSpan={2} className="text-center text-muted-foreground">
                  No members yet.
                </TableCell>
              </TableRow>
            ) : (
              members.map((member: Member) => {
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
                              variant="ghost"
                              size="sm"
                              className="gap-1 text-muted-foreground normal-case text-xs"
                              disabled={isUpdating}
                            >
                              {getDisplayRole(role === OrgRoles.OWNER ? OrgRoles.ADMIN : role)}
                              <ChevronDown className="size-3" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {ROLE_OPTIONS.map((r) => (
                              <DropdownMenuItem
                                key={r.value}
                                onClick={() => handleRoleChange(id, member, r.value)}
                                className={
                                  (role === OrgRoles.OWNER ? OrgRoles.ADMIN : role) === r.value
                                    ? 'bg-muted'
                                    : ''
                                }
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
                        role && <Badge variant="code">{getDisplayRole(role)}</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <InviteMemberDialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen} />

      {demotedUser && (
        <AssignProjectsDialog
          open={assignProjectsDialogOpen}
          onOpenChange={setAssignProjectsDialogOpen}
          tenantId={organizationId}
          userId={demotedUser.userId}
          userName={demotedUser.userName}
          onComplete={handleAssignProjectsComplete}
        />
      )}
    </div>
  );
}
