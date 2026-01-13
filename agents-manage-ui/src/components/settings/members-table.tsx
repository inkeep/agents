import { UserPlus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { InviteMemberDialog } from '@/components/auth/invite-member-dialog';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useRuntimeConfig } from '@/contexts/runtime-config-context';
import { type useAuthClient as UseAuthClientType, useAuthClient } from '@/lib/auth-client';
import { Button } from '../ui/button';

type FullOrganization = NonNullable<
  Awaited<
    ReturnType<ReturnType<typeof UseAuthClientType>['organization']['getFullOrganization']>
  >['data']
>;

type Member = FullOrganization['members'][number];

const DROPDOWN_ROLES = ['admin', 'member'] as const;
type Role = 'owner' | 'admin' | 'member';

const getDisplayRole = (role: string | null): string => {
  if (!role) return '';
  // Display 'owner' as 'Admin' in the UI for simplicity
  if (role === 'owner') return 'Admin';
  return role.charAt(0).toUpperCase() + role.slice(1);
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
  const { PUBLIC_IS_INKEEP_CLOUD_DEPLOYMENT } = useRuntimeConfig();

  const canEditRoles = currentMember?.role === 'owner' || currentMember?.role === 'admin';

  const handleRoleChange = async (memberId: string, newRole: Role) => {
    if (!canEditRoles) return;

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
      onMemberUpdated?.();
    } catch (err) {
      toast.error('Failed to update role', {
        description: err instanceof Error ? err.message : 'An unexpected error occurred.',
      });
    } finally {
      setUpdatingMemberId(null);
    }
  };

  const canEditMember = (member: Member): boolean => {
    if (PUBLIC_IS_INKEEP_CLOUD_DEPLOYMENT) return false;
    if (!canEditRoles || !currentMember) return false;
    if (member.id === currentMember.id) return false;
    if (currentMember.role === 'admin' && member.role === 'owner') return false;
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
          <Button onClick={() => setInviteDialogOpen(true)} size="sm" variant="outline">
            <UserPlus className="h-4 w-4 mr-2" />
            Invite
          </Button>
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
                        <Select
                          value={role === 'owner' ? 'admin' : (role ?? undefined)}
                          onValueChange={(value: Role) => handleRoleChange(id, value)}
                          disabled={isUpdating}
                        >
                          <SelectTrigger size="sm" className="w-[120px]">
                            <SelectValue placeholder="Select role" />
                          </SelectTrigger>
                          <SelectContent>
                            {DROPDOWN_ROLES.map((r) => (
                              <SelectItem key={r} value={r}>
                                {getDisplayRole(r)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
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
    </div>
  );
}
