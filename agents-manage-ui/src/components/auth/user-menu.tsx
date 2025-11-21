'use client';

import { LogOut, User, UserPlus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuthSession } from '@/hooks/use-auth';
import { authClient } from '@/lib/auth-client';
import { InviteMemberDialog } from './invite-member-dialog';

export function UserMenu() {
  const { user, isLoading } = useAuthSession();
  const router = useRouter();
  const [inviteMemberOpen, setInviteMemberOpen] = useState(false);

  if (isLoading || !user) {
    return null;
  }

  const handleSignOut = async () => {
    await authClient.signOut();
    router.push('/login');
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground text-sidebar-foreground/80 dark:text-sidebar-foreground"
          >
            <User className="h-4 w-4" />
            <span className="sr-only">User menu</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col space-y-1">
              <p className="text-xs text-muted-foreground">{user.email}</p>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="gap-2" onClick={() => setInviteMemberOpen(true)}>
            <UserPlus className="h-4 w-4" />
            Invite team member
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleSignOut} className="gap-2">
            <LogOut className="h-4 w-4" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <InviteMemberDialog open={inviteMemberOpen} onOpenChange={setInviteMemberOpen} />
    </>
  );
}
