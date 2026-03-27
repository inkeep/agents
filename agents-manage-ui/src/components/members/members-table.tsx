import { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { UserProvider } from '@/lib/actions/user-accounts';
import { InvitationRow } from './invitation-row';
import { InviteButton } from './invite-button';
import { MemberRow } from './member-row';
import type { Invitation, Member } from './types';

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
  // Sort members alphabetically by name (A→Z)
  const sortedMembers = useMemo(() => {
    return [...members].sort((a, b) => {
      const nameA = (a.user.name || a.user.email).toLowerCase();
      const nameB = (b.user.name || b.user.email).toLowerCase();
      return nameA.localeCompare(nameB);
    });
  }, [members]);

  return (
    <div>
      <div className="rounded-lg border">
        <div className="flex items-center justify-between px-4 py-4">
          <div className="flex items-center gap-2">
            <h2 className="text-md font-medium text-gray-700 dark:text-white/70">Members</h2>
            <Badge variant="count">{members.length}</Badge>
          </div>
          {isOrgAdmin && (
            <InviteButton isOrgAdmin={isOrgAdmin} onInvitationsSent={onMemberUpdated} />
          )}
        </div>
        <Table>
          <TableHeader>
            <TableRow noHover>
              <TableHead>Name</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Project Access</TableHead>
              <TableHead>
                <span className="sr-only">Actions</span>
              </TableHead>
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
                {sortedMembers.map((member) => (
                  <MemberRow
                    key={member.id}
                    member={member}
                    currentMember={currentMember}
                    organizationId={organizationId}
                    isOrgAdmin={isOrgAdmin}
                    memberProviders={memberProviders}
                    onMemberUpdated={onMemberUpdated}
                  />
                ))}
                {pendingInvitations.map((invitation) => (
                  <InvitationRow
                    key={invitation.id}
                    invitation={invitation}
                    isOrgAdmin={isOrgAdmin}
                    onInvitationRevoked={onMemberUpdated}
                  />
                ))}
              </>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
