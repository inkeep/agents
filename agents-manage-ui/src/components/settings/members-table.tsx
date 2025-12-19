import { useState } from 'react';
import { InviteMemberDialog } from '@/components/auth/invite-member-dialog';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { useAuthClient } from '@/lib/auth-client';

type FullOrganization = NonNullable<
  Awaited<
    ReturnType<ReturnType<typeof useAuthClient>['organization']['getFullOrganization']>
  >['data']
>;

interface MembersTableProps {
  members: FullOrganization['members'];
}

export function MembersTable({ members }: MembersTableProps) {
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);

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
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  No members yet.
                </TableCell>
              </TableRow>
            ) : (
              members.map(({ id, user, role }: FullOrganization['members'][number]) => (
                <TableRow key={id} noHover>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium text-foreground">{user.name || user.email}</span>
                      <span className="text-sm text-muted-foreground">{user.email}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {role && (
                      <Badge variant="code" className="uppercase">
                        {role}
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <InviteMemberDialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen} />
    </div>
  );
}
