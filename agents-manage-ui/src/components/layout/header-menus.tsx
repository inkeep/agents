'use client';

import { useEffect, useState } from 'react';
import { useAuthSession } from '@/hooks/use-auth';
import { UserMenu } from '../auth/user-menu';
import { ThemeToggle } from '../theme-toggle';
import { Skeleton } from '../ui/skeleton';

export function HeaderMenus() {
  const [hasMounted, setHasMounted] = useState(false);
  const { user, isLoading } = useAuthSession();

  useEffect(() => {
    setHasMounted(true);
  }, []);

  // Always render skeleton on server and initial client render to prevent hydration mismatch
  if (!hasMounted || isLoading) {
    return <Skeleton className="h-7 w-7" />;
  }

  return !user ? <ThemeToggle /> : <UserMenu />;
}
