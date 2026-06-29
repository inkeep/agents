'use client';

import { useTheme } from 'next-themes';
import { type FC, useEffect } from 'react';
import { MONACO_THEME_NAME } from '@/constants/theme';
import { useMonacoStore } from '@/features/agent/state/use-monaco-store';
import { useAuthSession } from '@/hooks/use-auth';
import { useIsMounted } from '@/hooks/use-is-mounted';
import { UserMenu } from '../auth/user-menu';
import { ThemeToggle } from '../theme-toggle';
import { Skeleton } from '../ui/skeleton';

export const HeaderMenus: FC = () => {
  const { user, isLoading } = useAuthSession();
  const { resolvedTheme } = useTheme();
  const isMounted = useIsMounted();
  const monaco = useMonacoStore((state) => state.monaco);
  const isDark = resolvedTheme === 'dark';
  const IconToUse = user ? UserMenu : ThemeToggle;

  useEffect(() => {
    const monacoTheme = isDark ? MONACO_THEME_NAME.dark : MONACO_THEME_NAME.light;
    monaco?.editor.setTheme(monacoTheme);
  }, [isDark, monaco]);

  return !isMounted || isLoading ? <Skeleton className="h-7 w-7" /> : <IconToUse />;
};
