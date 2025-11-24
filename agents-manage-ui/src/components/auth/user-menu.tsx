'use client';

import { LogOut, User } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuthClient } from '@/lib/auth-client';

export function UserMenu() {
  const authClient = useAuthClient();
  const session = authClient.useSession();
  const router = useRouter();
  
  const user = session.data?.user;

  const handleSignOut = async () => {
    await authClient.signOut();
    router.push('/login');
  };

  // Always render the same structure to avoid hydration errors
  // Use placeholder when no user to maintain consistent DOM
  if (!user) {
    return <div className="size-7" />;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={session.isPending}>
        <Button
          variant="ghost"
          size="icon"
          className="size-7 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground text-sidebar-foreground/80 dark:text-sidebar-foreground"
          disabled={session.isPending}
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
        <DropdownMenuItem onClick={handleSignOut} className="gap-2">
          <LogOut className="h-4 w-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
