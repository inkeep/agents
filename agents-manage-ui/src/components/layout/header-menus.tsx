'use client';

import { useEffect } from 'react';
import { useAuthSession } from '@/hooks/use-auth';
import { UserMenu } from '../auth/user-menu';
import { ThemeToggle } from '../theme-toggle';
import { Skeleton } from '../ui/skeleton';
import { MONACO_THEME_NAME } from '@/constants/theme';
import { useMonacoStore } from '@/features/agent/state/use-monaco-store';
import { useTheme } from 'next-themes';
import { useIsMounted } from '@inkeep/agents-ui';

export function HeaderMenus() {
  const { user, isLoading } = useAuthSession();
  const { resolvedTheme } = useTheme();
  const isMounted = useIsMounted();
  const monaco = useMonacoStore((state) => state.monaco);

  useEffect(() => {
    const isDark = resolvedTheme === 'dark';
    const monacoTheme = isDark ? MONACO_THEME_NAME.dark : MONACO_THEME_NAME.light;
    monaco?.editor.setTheme(monacoTheme);
  }, [resolvedTheme, monaco]);

  // Always render skeleton on server and initial client render to prevent hydration mismatch
  if (!isMounted || isLoading) {
    return <Skeleton className="h-7 w-7" />;
  }

  return user ? <UserMenu /> : <ThemeToggle />;
}
