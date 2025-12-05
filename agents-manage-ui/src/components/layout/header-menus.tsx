'use client';

import { useAuthSession } from '@/hooks/use-auth';
import { UserMenu } from '../auth/user-menu';
import { ThemeToggle } from '../theme-toggle';
import { Skeleton } from '../ui/skeleton';

export function HeaderMenus() {
  const { user, isLoading } = useAuthSession();
  if (isLoading) {
    return <Skeleton className="h-7 w-7" />;
  }
  return !user ? <ThemeToggle /> : <UserMenu />;
}
