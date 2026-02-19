import { OrgRoles } from '@inkeep/agents-core/client-exports';
import { MoreVertical, RotateCcwKey, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { UserProvider } from '@/lib/actions/user-accounts';

type AuthClient = any; // Replace with proper type
type Member = AuthClient['$Infer']['Member'];

interface MemberActionsMenuProps {
  member: Member;
  currentMember: Member | null;
  isOrgAdmin: boolean;
  memberProviders: UserProvider[];
  onResetPassword: (member: Member) => void;
  onChangePassword: () => void;
  onDeleteMember: (member: Member) => void;
  resettingMemberId: string | null;
  deletingMemberId: string | null;
}

export function MemberActionsMenu({
  member,
  currentMember,
  isOrgAdmin,
  memberProviders,
  onResetPassword,
  onChangePassword,
  onDeleteMember,
  resettingMemberId,
  deletingMemberId,
}: MemberActionsMenuProps) {
  const isCurrentUser = currentMember?.id === member.id;

  const canDeleteMember = (): boolean => {
    if (!isOrgAdmin || !currentMember) return false;
    if (member.id === currentMember.id) return false;
    if (member.role === OrgRoles.OWNER) return false;
    return true;
  };

  const memberHasCredentialAuth = (): boolean => {
    const userProviders = memberProviders.find((p) => p.userId === member.user.id);
    return userProviders?.providers.includes('credential') ?? false;
  };

  const showActionsMenu = isOrgAdmin && (memberHasCredentialAuth() || canDeleteMember());

  if (!showActionsMenu) {
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
        {memberHasCredentialAuth() && (
          <>
            {isCurrentUser ? (
              <DropdownMenuItem onClick={onChangePassword}>
                <RotateCcwKey className="h-4 w-4" />
                Change password
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                onClick={() => onResetPassword(member)}
                disabled={resettingMemberId === member.id}
              >
                <RotateCcwKey className="h-4 w-4" />
                Reset password
              </DropdownMenuItem>
            )}
            {canDeleteMember() && <DropdownMenuSeparator />}
          </>
        )}
        {canDeleteMember() && (
          <DropdownMenuItem
            onClick={() => onDeleteMember(member)}
            disabled={deletingMemberId === member.id}
            variant="destructive"
          >
            <Trash2 className="h-4 w-4" />
            Delete member
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
